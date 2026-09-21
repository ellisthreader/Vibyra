import type { Session, SessionKind, WorkspaceActions } from '../ui/types';
import { InputQueue } from './inputQueue';
import { byteLength, type Snapshot } from './output';
import { scaffoldActions } from './scaffoldActions';
import { requireLease, resize, selectSession } from './session';
import type { WorkspaceStore } from './WorkspaceStore';

/** The Mac's wording for a lease another phone took (`phone/control.rs`). */
const leaseTaken = (error: unknown) => error instanceof Error && error.message.startsWith('Another phone took this terminal');

export function makeActions(store: WorkspaceStore): Pick<WorkspaceActions, 'createSession' | 'sendInput' | 'resize' |
  'stopSession' | 'peekSession' | 'followOutput' | 'listFiles' | 'readFile' | 'getDiff' | 'revokeDevice' | 'resolveApproval' | 'scaffold' | 'renameProject' | 'forgetProject'> {
  // Keys go in order, one request at a time; see `InputQueue`. An authenticated
  // acknowledgement remains definitive even if the view disconnects immediately
  // after receiving it. Never turn it into a retry.
  const inputs = new InputQueue(async data => {
    const lease = requireLease(store);
    try {
      await store.deps.rpc.request('session.input', { ...lease, inputId: store.deps.uuid(), data });
    } catch (error) {
      // A Mac hands its terminal to the newest phone that opens it. The one
      // it was taken from learns here, and goes back to watching so that a
      // tap on the terminal takes it again rather than repeating the refusal.
      if (leaseTaken(error) && store.lease?.lease === lease.lease) { store.lease = null; store.update({ control: 'readonly' }); }
      throw error;
    }
  });
  const request = async <T>(method: string, params: object): Promise<T> => {
    const epoch = store.epoch;
    const result = await store.deps.rpc.request<T>(method, params);
    store.assertCurrent(epoch); return result;
  };
  const project = (projectId: string) => {
    if (store.state.status !== 'connected' || !store.state.projects.some(item => item.id === projectId)) {
      throw new Error('This project is not available on the connected computer.');
    }
  };
  return {
    ...scaffoldActions(store),
    createSession: async (projectId: string, kind: SessionKind, title: string) => {
      project(projectId);
      const epoch = store.epoch;
      const cleanTitle = title.trim();
      if (!cleanTitle || cleanTitle.length > 120) throw new Error('Use a session title between 1 and 120 characters.');
      const key = store.creates.key(store.state.host!.id, projectId, kind, cleanTitle);
      const requestId = store.creates.begin(key);
      await store.persistCreates(); store.assertCurrent(epoch);
      let result: Session;
      try {
        result = await request<Session>('session.create', { projectId, kind, title: cleanTitle, requestId,
          // A chat, for any agent that computer runs as one; a terminal otherwise.
          ...(store.state.conversationAvailable && (store.state.conversationProviders ?? ['codex']).includes(kind) ? { runner: 'conversation' } : {}) });
        store.creates.success(key);
        await store.persistCreates().catch(error => store.report(error));
      } catch (error) { store.creates.failed(key, error); await store.persistCreates().catch(() => {}); throw error; }
      store.assertCurrent(epoch);
      store.update({ sessions: [...store.state.sessions.filter(item => item.id !== result.id), result] });
      await selectSession(store, result.id, true);
      return result;
    },
    sendInput: async data => {
      requireLease(store);
      if (!data || byteLength(data) > 8192) throw new Error('Send less than 8 KB of terminal input at a time.');
      await inputs.push(data);
    },
    resize: (cols, rows) => resize(store, cols, rows),
    stopSession: async sessionId => {
      if (!store.state.sessions.some(item => item.id === sessionId)) throw new Error('This session is unavailable.');
      await request('session.stop', { sessionId }); await store.refresh();
    },
    peekSession: sessionId => request<Snapshot>('session.snapshot', { sessionId }),
    // The computer streams every terminal's output to this phone; the store
    // keeps only the open one's. Previews on the Projects page listen here
    // for the rest rather than asking for each terminal again.
    followOutput: listener => store.deps.rpc.listen(notice => {
      if (notice.type !== 'message' || store.state.status !== 'connected') return;
      const { event, data } = notice.payload ?? {};
      if (!data?.sessionId) return;
      if (event === 'terminal.output') listener({ type: 'output', frame: data });
      else if (event === 'terminal.resync') listener({ type: 'resync', sessionId: data.sessionId });
      else if (event === 'terminal.size') listener({ type: 'size', sessionId: data.sessionId, cols: data.cols, rows: data.rows });
    }),
    listFiles: async (projectId, path) => { project(projectId); return request('project.files', { projectId, path }); },
    readFile: async (projectId, path) => { project(projectId); return request('project.read', { projectId, path }); },
    getDiff: async projectId => { project(projectId); return request('project.diff', { projectId }); },
    // Both change the list of projects the computer shares, and neither
    // touches the folder itself: a renamed project keeps its folder name, and a
    // forgotten one keeps every file it had.
    renameProject: async (projectId, name) => {
      project(projectId);
      await request('project.rename', { projectId, name });
      await store.refresh();
    },
    forgetProject: async projectId => {
      project(projectId);
      await request('project.forget', { projectId });
      await store.refresh();
    },
    revokeDevice: async deviceId => {
      if (deviceId !== store.saved?.deviceId) throw new Error('Remove other devices directly on your computer.');
      await store.deps.rpc.request('device.revoke', { deviceId }); await store.actions.forgetDevice!();
    },
    resolveApproval: async (approvalId, allow) => {
      const approval = store.state.approvals.find(item => item.id === approvalId);
      if (!approval || (approval.expiresAt && Date.parse(approval.expiresAt) <= Date.now())) {
        throw new Error('This approval expired. Refresh your workspace.');
      }
      await request('approval.resolve', { approvalId, decision: allow ? 'approve' : 'deny' }); await store.refresh();
    },
  };
}
