import { makeAccountActions } from '../account/accountActions';
import type { Notice } from '../transport/RpcClient';
import type { WorkspaceActions, ThemePreference } from '../ui/types';
import { CreateRequests } from './createRequest';
import { connect, initialize, forget, reconnect } from './connection';
import { makeActions } from './workspaceActions';
import { OutputLedger } from './output';
import { claimControl, selectSession } from './session';
import { initialState, type HostState, type RuntimeDependencies, type RuntimeState, type SavedConnection } from './types';

export class WorkspaceStore {
  state: RuntimeState = { ...initialState };
  saved: SavedConnection | null = null;
  token: string | null = null;
  epoch = 0;
  selectionEpoch = 0;
  ledger: OutputLedger | null = null;
  lease: { sessionId: string; lease: string; generation: string } | null = null;
  dimensions: [number, number] | null = null;
  readonly creates: CreateRequests;
  readonly actions: WorkspaceActions;
  private subscribers = new Set<() => void>();
  private unsubscribe: () => void;
  private refreshPending: Promise<void> | null = null;
  private createPersistence = Promise.resolve();
  constructor(readonly deps: RuntimeDependencies) {
    this.creates = new CreateRequests(deps.uuid);
    this.unsubscribe = deps.rpc.listen(this.receive);
    this.actions = { ...makeActions(this), ...makeAccountActions(this), connect: link => connect(this, link), reconnect: () => reconnect(this),
      disconnect: this.disconnect, refresh: () => this.refresh(true), selectSession: id => { void selectSession(this, id); },
      claimControl: () => claimControl(this), setTheme: this.setTheme, forgetDevice: () => forget(this) };
  }
  subscribe = (callback: () => void) => { this.subscribers.add(callback); return () => { this.subscribers.delete(callback); }; };
  snapshot = () => this.state;
  update(patch: Partial<RuntimeState>) {
    this.state = { ...this.state, ...patch }; for (const callback of this.subscribers) callback();
  }
  current(epoch: number) { return this.epoch === epoch; }
  assertCurrent(epoch: number) { if (!this.current(epoch)) throw new Error('The connection changed. Try again on the current computer.'); }
  initialize = () => initialize(this);
  persistCreates() {
    const snapshot = this.creates.serialize();
    this.createPersistence = this.createPersistence.catch(() => {}).then(() => this.deps.storage.write('pending-creates', snapshot));
    return this.createPersistence;
  }
  disconnect = () => {
    this.epoch++; this.clearSession(); this.deps.rpc.close();
    this.update({ status: 'offline', error: null, projects: [], sessions: [], devices: [], approvals: [], syncing: false });
  };
  suspend = () => {
    if (this.state.status === 'offline' || this.state.status === 'error') return;
    this.disconnect(); this.update({ error: 'The connection paused while the app was away. Reconnect to catch up.' });
  };
  clearSession() {
    this.selectionEpoch++; this.ledger = null; this.lease = null; this.dimensions = null;
    this.update({ selectedSessionId: null, output: '', control: 'none', syncing: false });
  }
  acceptHost(result: HostState) {
    if (result.protocol !== 1 || result.host?.id !== this.saved?.pairing.hostId || !Array.isArray(result.sessions) ||
        !Array.isArray(result.projects) || !Array.isArray(result.devices) || !Array.isArray(result.approvals)) {
      throw new Error('The computer returned an unsupported workspace. Pair it again.');
    }
    const sessions = result.sessions.map(item => item.status === 'exited' ? { ...item,
      exitCode: item.exitCode ?? this.state.sessions.find(previous => previous.id === item.id)?.exitCode } : item);
    this.update({ host: result.host, projects: result.projects, sessions,
      devices: result.devices.map(item => ({ id: item.id, name: item.name, current: item.id === this.saved?.deviceId })),
      approvals: result.approvals.filter(item => item.deviceId === this.saved?.deviceId)
        .map(item => ({ id: item.id, title: item.title, detail: item.description, expiresAt: item.expiresAt })) });
    if (this.state.selectedSessionId && !result.sessions.some(item => item.id === this.state.selectedSessionId)) this.clearSession();
  }
  refresh = async (terminal = false) => {
    if (this.state.status !== 'connected') throw new Error('Reconnect to refresh your workspace.');
    if (this.refreshPending) return this.refreshPending;
    const epoch = this.epoch;
    const work = async () => {
      this.update({ syncing: true });
      try {
        const result = await this.deps.rpc.request<HostState>('host.state');
        this.assertCurrent(epoch); this.acceptHost(result);
        if (terminal && this.state.selectedSessionId) await selectSession(this, this.state.selectedSessionId);
        this.assertCurrent(epoch); this.update({ error: null });
      } catch (error) { if (this.current(epoch)) this.report(error); throw error; }
      finally { if (this.current(epoch)) this.update({ syncing: false }); }
    };
    this.refreshPending = work();
    try { await this.refreshPending; } finally { this.refreshPending = null; }
  };
  report(error: unknown) { this.update({ error: error instanceof Error ? error.message : 'The computer could not complete this request.' }); }
  setTheme = (themePreference: ThemePreference) => {
    this.update({ themePreference });
    void this.deps.storage.write('theme', themePreference).catch(error => this.report(error));
  };
  dispose() { this.unsubscribe(); this.disconnect(); this.subscribers.clear(); }
  private receive = (notice: Notice) => {
    if (notice.type === 'error' || notice.type === 'closed') {
      if (!['connected', 'connecting', 'pairing'].includes(this.state.status)) return;
      this.epoch++; this.clearSession();
      this.update({ status: notice.type === 'error' ? 'error' : 'offline', syncing: false,
        projects: [], sessions: [], devices: [], approvals: [], host: this.saved?.host ?? (this.saved ? {
          id: this.saved.pairing.hostId, name: this.saved.pairing.name, platform: 'Computer',
        } : null), error: notice.message ?? 'Connection closed. Reconnect to catch up.' });
      if (notice.type === 'error') this.deps.rpc.close();
      return;
    }
    if (notice.type !== 'message' || this.state.status !== 'connected') return;
    const event = notice.payload;
    if (event?.event === 'host.changed') void this.refresh().catch(() => {});
    if (event?.event === 'terminal.resync' && event.data?.sessionId === this.state.selectedSessionId) {
      this.update({ control: 'none', error: 'Catching up with terminal output…' });
      void selectSession(this, this.state.selectedSessionId);
    }
    if (event?.event === 'terminal.output' && this.ledger && event.data?.sessionId === this.state.selectedSessionId) {
      try { this.ledger.push(event.data); this.update({ output: this.ledger.output }); }
      catch (error) { this.lease = null; this.update({ control: 'none' }); this.report(error); }
    }
    if (event?.event === 'terminal.exit') {
      this.update({ sessions: this.state.sessions.map(item => item.id === event.data?.sessionId
        ? { ...item, status: 'exited', exitCode: event.data.exitCode ?? undefined } : item) });
      if (event.data?.sessionId === this.state.selectedSessionId) { this.lease = null; this.update({ control: 'none' }); }
    }
  };
}
