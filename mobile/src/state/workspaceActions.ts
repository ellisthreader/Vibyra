import type { Session, SessionKind, TerminalLaunchOptions, TerminalModelCatalogue, WorkspaceActions } from '../ui/types';
import { terminalInput } from './terminalInput';
import type { Snapshot } from './output';
import { scaffoldActions } from './scaffoldActions';
import { resize, selectSession } from './session';
import type { WorkspaceStore } from './WorkspaceStore';

export function makeActions(
  store: WorkspaceStore,
): Pick<
  WorkspaceActions,
  | 'createSession'
  | 'listTerminalModels'
  | 'aiAccounts'
  | 'sendInput'
  | 'resize'
  | 'stopSession'
  | 'resumeSavedSession'
  | 'peekSession'
  | 'followOutput'
  | 'listFiles'
  | 'readFile'
  | 'getDiff'
  | 'revokeDevice'
  | 'resolveApproval'
  | 'scaffold'
  | 'renameProject'
  | 'forgetProject'
> {
  const request = async <T>(method: string, params: object): Promise<T> => {
    const epoch = store.epoch;
    const result = await store.deps.rpc.request<T>(method, params);
    store.assertCurrent(epoch);
    return result;
  };
  const project = (projectId: string) => {
    if (
      store.state.status !== 'connected' ||
      !store.state.projects.some((item) => item.id === projectId)
    ) {
      throw new Error('This project is not available on the connected computer.');
    }
  };
  return {
    ...scaffoldActions(store),
    listTerminalModels: () => request('session.models', {}),
    aiAccounts: async (method, params = {}) => {
      const epoch = store.epoch;
      const answer = await store.deps.rpc.request(`aiAccounts.${method}`, params, 60_000);
      store.assertCurrent(epoch);
      return answer;
    },
    createSession: async (
      projectId: string,
      kind: SessionKind,
      title: string,
      options?: TerminalLaunchOptions,
    ) => {
      if (options?.source === 'vibyra') throw new Error('Token terminals must use the metered session route.');
      project(projectId);
      const epoch = store.epoch;
      const cleanTitle = title.trim();
      if (!cleanTitle || cleanTitle.length > 120)
        throw new Error('Use a session title between 1 and 120 characters.');
      const model = options?.model;
      if (model && (!store.state.terminalModelsAvailable || kind === 'shell'))
        throw new Error('This computer cannot start that model. Refresh and choose again.');
      const effort = options?.effort;
      if (effort !== undefined) {
        const catalogue = await request<TerminalModelCatalogue>('session.models', {});
        const selected = catalogue.models.find(item => item.id === model && item.kind === kind);
        if (kind === 'shell' || !selected || catalogue.effortVersion !== 1 ||
          (effort !== null ? !selected.efforts?.includes(effort) : !!selected.efforts?.length))
          throw new Error('This model or effort changed. Refresh the model list and choose again.');
        project(projectId);
      }
      const safeMode = options?.safeMode === true;
      const permissionMode = options?.permissionMode;
      if (!['shell', 'codex', 'claude'].includes(kind)) {
        const catalogue = await request<TerminalModelCatalogue>('session.models', {});
        if (!model || !catalogue.runnerKinds?.some(runner => runner === kind) || !catalogue.models.some(item => item.id === model && item.kind === kind))
          throw new Error('This model is no longer available on your computer. Refresh and choose again.');
        project(projectId);
      }
      if (permissionMode !== undefined) {
        if (kind === 'shell' || !['standard', 'full'].includes(permissionMode) || !store.state.terminalModelsAvailable)
          throw new Error('This computer cannot apply that permission choice.');
        const catalogue = await request<TerminalModelCatalogue>('session.models', {});
        if (catalogue.permissionsVersion !== 1 || !catalogue.permissionModes?.includes(permissionMode))
          throw new Error('Update Vibyra on your computer to choose permissions from your phone.');
        project(projectId);
      }
      const key = store.creates.key(
        store.state.host!.id,
        projectId,
        kind,
        cleanTitle,
        safeMode,
        model,
        permissionMode,
        effort,
      );
      const requestId = options?.requestId ?? store.creates.begin(key);
      await store.persistCreates();
      store.assertCurrent(epoch);
      let result: Session;
      try {
        result = await request<Session>('session.create', {
          projectId,
          kind,
          title: cleanTitle,
          requestId,
          safeMode,
          ...(model ? { model } : {}),
          ...(effort !== undefined ? { effort } : {}),
          ...(permissionMode ? { permissionMode } : {}),
          // A chat, for any agent that computer runs as one; a terminal otherwise.
          ...(store.state.conversationAvailable &&
          (store.state.conversationProviders ?? ['codex']).includes(kind)
            ? { runner: 'conversation' }
            : {}),
        });
        store.creates.success(key);
        await store.persistCreates().catch((error) => store.report(error));
      } catch (error) {
        store.creates.failed(key, error);
        await store.persistCreates().catch(() => {});
        throw error;
      }
      store.assertCurrent(epoch);
      store.update({
        sessions: [...store.state.sessions.filter((item) => item.id !== result.id), result],
      });
      await selectSession(store, result.id, true);
      return result;
    },
    sendInput: terminalInput(store),
    resize: (cols, rows) => resize(store, cols, rows),
    resumeSavedSession: async (sessionId) => {
      const selected = store.selectionEpoch;
      const result = await request<Session>('session.resumeSaved', { sessionId });
      store.update({ sessions: [...store.state.sessions.filter(item => item.id !== sessionId && item.id !== result.id), result] });
      if (selected === store.selectionEpoch) await selectSession(store, result.id, true);
    },
    stopSession: async (sessionId) => {
      if (!store.state.sessions.some((item) => item.id === sessionId))
        throw new Error('This session is unavailable.');
      await request('session.stop', { sessionId });
      await store.refresh();
    },
    peekSession: (sessionId) => request<Snapshot>('session.snapshot', { sessionId }),
    // The computer streams every terminal's output to this phone; the store
    // keeps only the open one's. Previews on the Projects page listen here
    // for the rest rather than asking for each terminal again.
    followOutput: (listener) =>
      store.deps.rpc.listen((notice) => {
        if (notice.type !== 'message' || store.state.status !== 'connected') return;
        const { event, data } = notice.payload ?? {};
        if (!data?.sessionId) return;
        if (event === 'terminal.output') listener({ type: 'output', frame: data });
        else if (event === 'terminal.resync')
          listener({ type: 'resync', sessionId: data.sessionId });
        else if (event === 'terminal.size')
          listener({ type: 'size', sessionId: data.sessionId, cols: data.cols, rows: data.rows });
      }),
    listFiles: async (projectId, path) => {
      project(projectId);
      return request('project.files', { projectId, path });
    },
    readFile: async (projectId, path) => {
      project(projectId);
      return request('project.read', { projectId, path });
    },
    getDiff: async (projectId) => {
      project(projectId);
      return request('project.diff', { projectId });
    },
    // Both change the list of projects the computer shares, and neither
    // touches the folder itself: a renamed project keeps its folder name, and a
    // forgotten one keeps every file it had.
    renameProject: async (projectId, name) => {
      project(projectId);
      await request('project.rename', { projectId, name });
      await store.refresh();
    },
    forgetProject: async (projectId) => {
      project(projectId);
      await request('project.forget', { projectId });
      await store.refresh();
    },
    revokeDevice: async (deviceId) => {
      if (deviceId !== store.saved?.deviceId)
        throw new Error('Remove other devices directly on your computer.');
      await store.deps.rpc.request('device.revoke', { deviceId });
      await store.actions.forgetDevice!();
    },
    resolveApproval: async (approvalId, allow) => {
      const approval = store.state.approvals.find((item) => item.id === approvalId);
      if (!approval || (approval.expiresAt && Date.parse(approval.expiresAt) <= Date.now())) {
        throw new Error('This approval expired. Refresh your workspace.');
      }
      await request('approval.resolve', { approvalId, decision: allow ? 'approve' : 'deny' });
      await store.refresh();
    },
  };
}
