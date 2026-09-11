import type { Session, SessionKind, WorkspaceActions } from '../ui/types';
import { byteLength } from './output';
import { requireLease, resize, selectSession } from './session';
import type { WorkspaceStore } from './WorkspaceStore';

export function makeActions(store: WorkspaceStore): Pick<WorkspaceActions, 'createSession' | 'sendInput' | 'resize' |
  'stopSession' | 'listFiles' | 'readFile' | 'getDiff' | 'revokeDevice' | 'resolveApproval'> {
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
          ...(store.state.conversationAvailable && kind === 'codex' ? { runner: 'conversation' } : {}) });
        store.creates.success(key);
        await store.persistCreates().catch(error => store.report(error));
      } catch (error) { store.creates.failed(key, error); await store.persistCreates().catch(() => {}); throw error; }
      store.assertCurrent(epoch);
      store.update({ sessions: [...store.state.sessions.filter(item => item.id !== result.id), result] });
      await selectSession(store, result.id, true);
      return result;
    },
    sendInput: async data => {
      const lease = requireLease(store);
      if (!data || byteLength(data) > 8192) throw new Error('Send less than 8 KB of terminal input at a time. Your draft has been kept.');
      // An authenticated acknowledgement remains definitive even if the view
      // disconnects immediately after receiving it. Never turn it into a retry.
      await store.deps.rpc.request('session.input', { ...lease, inputId: store.deps.uuid(), data });
    },
    resize: (cols, rows) => resize(store, cols, rows),
    stopSession: async sessionId => {
      if (!store.state.sessions.some(item => item.id === sessionId)) throw new Error('This session is unavailable.');
      await request('session.stop', { sessionId }); await store.refresh();
    },
    listFiles: async (projectId, path) => { project(projectId); return request('project.files', { projectId, path }); },
    readFile: async (projectId, path) => { project(projectId); return request('project.read', { projectId, path }); },
    getDiff: async projectId => { project(projectId); return request('project.diff', { projectId }); },
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
