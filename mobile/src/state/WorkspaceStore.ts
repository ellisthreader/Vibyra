import { hostSnapshot } from './hostSnapshot';
import { vibesActions } from './vibesActions';
import { makeAccountActions } from '../account/accountActions';
import { conversationActions } from './conversationActions';
import { ConversationLedger } from './conversationLedger';
import { receiveConversation, loadConversation } from './conversationSession';
import { cachedConversation } from './conversationContinuity';
import type { Notice } from '../transport/RpcClient';
import type { WorkspaceActions, ThemePreference } from '../ui/types';
import { restoreAccent, restoreTerminalFontSize, setAccent } from './preferences';
import { CreateRequests } from './createRequest';
import { AutoConnect } from './autoConnect';
import { connect, initialize, forget, putAway, reconnect } from './connection';
import { makeActions } from './workspaceActions'; import { remoteActions } from './remoteActions';
import { OutputLedger } from './output';
import { claimControl, hostResized, resnapshotSession, selectSession } from './session';
import { initialState, type HostState, type RuntimeDependencies, type RuntimeState, type SavedConnection } from './types';

export class WorkspaceStore {
  state: RuntimeState = { ...initialState };
  saved: SavedConnection | null = null;
  token: string | null = null;
  epoch = 0;
  selectionEpoch = 0;
  ledger: OutputLedger | null = null;
  conversationLedger: ConversationLedger | null = null;
  conversationLoading: Promise<void> | null = null;
  lease: { sessionId: string; lease: string; generation: string } | null = null;
  /** When the connection attempt in flight began. A failure that takes a long
   *  time is a computer holding this phone for approval, not one out of reach. */
  attemptedAt = 0;
  dimensions: [number, number] | null = null;
  readonly creates: CreateRequests;
  readonly auto: AutoConnect;
  readonly actions: WorkspaceActions;
  private subscribers = new Set<() => void>();
  private unsubscribe: () => void;
  private refreshPending: Promise<void> | null = null;
  private createPersistence = Promise.resolve();
  /** True only while this store is closing the socket itself, so its own
   *  teardown is never mistaken for a computer that went away. */
  private deliberate = false;
  constructor(readonly deps: RuntimeDependencies) {
    this.creates = new CreateRequests(deps.uuid);
    this.auto = new AutoConnect(this, deps.retryDelays);
    this.unsubscribe = deps.rpc.listen(this.receive);
    this.actions = { ...makeActions(this), ...vibesActions(this), ...conversationActions(this), ...makeAccountActions(this), ...remoteActions(this), connect: link => connect(this, link), reconnect: () => this.reconnectByHand(),
      disconnect: () => putAway(this), refresh: () => this.refresh(true), selectSession: id => { void selectSession(this, id); },
      claimControl: () => claimControl(this), setTheme: this.setTheme, setAccent: accent => setAccent(this, accent), forgetDevice: () => forget(this),
      setTerminalFontSize: this.setTerminalFontSize };
  }
  subscribe = (callback: () => void) => { this.subscribers.add(callback); return () => { this.subscribers.delete(callback); }; };
  snapshot = () => this.state;
  update(patch: Partial<RuntimeState>) {
    this.state = { ...this.state, ...patch }; for (const callback of this.subscribers) callback();
  }
  current(epoch: number) { return this.epoch === epoch; }
  /** The saved computer as the app shows it: only one that has answered
   *  `host.state` at least once. A pairing that never completed keeps its key
   *  in `saved` but is not a computer yet, so nothing is shown or retried. */
  knownHost() { return this.saved?.host ?? null; }
  assertCurrent(epoch: number) { if (!this.current(epoch)) throw new Error('The connection changed. Try again on the current computer.'); }
  initialize = () => { restoreAccent(this); restoreTerminalFontSize(this); return initialize(this); };
  persistCreates() {
    const snapshot = this.creates.serialize();
    this.createPersistence = this.createPersistence.catch(() => {}).then(() => this.deps.storage.write('pending-creates', snapshot));
    return this.createPersistence;
  }
  disconnect = () => {
    const cached = cachedConversation(this);
    // Reset however the close ends: left set, every later drop read as the
    // store's own teardown, and nothing was ever retried again.
    this.deliberate = true;
    try { this.epoch++; this.clearSession(); this.deps.rpc.close(); } finally { this.deliberate = false; }
    this.update({ status: 'offline', error: null, projects: [], sessions: [], devices: [], approvals: [], syncing: false, ...cached });
  };
  /** The app left the screen. Let go of the socket and stop trying; the
   *  computer is picked up again the moment the app is back in front. */
  suspend = () => {
    this.auto.sleep();
    if (this.state.status === 'offline' || this.state.status === 'error') return;
    this.disconnect();
  };
  /** The app is in front again, or a network came back. */
  resume = () => this.auto.resume();
  clearSession() {
    // Not `dimensions`: that is the size of this phone's screen, not anything
    // the session owns. Clearing it here meant the grid was forgotten on every
    // switch, so the computer only ever heard a width when xterm happened to
    // change one — never for a terminal opened at the size the last one used.
    this.selectionEpoch++; this.ledger = null; this.lease = null;
    this.conversationLedger = null;
    this.update({ selectedSessionId: null, output: '', conversation: null, control: 'none', syncing: false,
      hostGrid: null });
  }
  acceptHost(result: HostState) {
    if (result.protocol !== 1 || result.host?.id !== this.saved?.pairing.hostId || !Array.isArray(result.sessions) ||
        !Array.isArray(result.projects) || !Array.isArray(result.devices) || !Array.isArray(result.approvals)) {
      throw new Error('The computer returned an unsupported workspace. Pair it again.');
    }
    const sessions = result.sessions.map(item => item.status === 'exited' ? { ...item,
      exitCode: item.exitCode ?? this.state.sessions.find(previous => previous.id === item.id)?.exitCode } : item);
    this.update({ host: result.host, projects: result.projects, sessions,
      vibesToolsAvailable: result.capabilities?.vibesToolsV1 === true, scaffoldAvailable: result.capabilities?.scaffoldV1 === true,
      // A Vibyra Desktop says so up front. Without keeping it, every screen
      // outside a session offers work this connection will refuse to start.
      viewOnly: result.capabilities?.readOnly === true,
      // Separate from viewOnly: a desktop that still refuses to start or stop
      // work can nonetheless let a phone type into the terminals it shares.
      canType: result.capabilities?.canInput === true, canManage: result.capabilities?.canManage === true,
      conversationAvailable: this.deps.iosConversations === true && result.capabilities?.conversationV1 === true,
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
        const result = await hostSnapshot(this, epoch);
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
  /** The size a person pinched the terminal to. A preference, like the theme. */
  setTerminalFontSize = (terminalFontSize: number) => {
    if (this.state.terminalFontSize === terminalFontSize) return;
    this.update({ terminalFontSize });
    void this.deps.storage.write('terminalFontSize', String(terminalFontSize)).catch(() => {});
  };
  setTheme = (themePreference: ThemePreference) => {
    this.update({ themePreference });
    void this.deps.storage.write('theme', themePreference).catch(error => this.report(error));
  };
  /** Why a connection attempt failed, but only once nothing is going to try
   *  again: while the ladder is still climbing, the reason is not news, and every
   *  screen already says "Reconnecting…". It lands when the app stops trying. */
  failure(reason: string) { return this.state.reconnecting ? null : reason; }
  /** Reconnect, pressed. The ladder starts over behind this attempt, and a
   *  failure the ladder has taken over is not the press's to report: showing
   *  it made every press that missed read as an error the instant it was made. */
  private reconnectByHand = async () => {
    this.auto.renew();
    try { await reconnect(this); } catch (error) { if (!this.state.reconnecting) throw error; }
  };
  dispose() { this.auto.stop(); this.unsubscribe(); this.disconnect(); this.subscribers.clear(); }
  private receive = (notice: Notice) => {
    if (notice.type === 'error' || notice.type === 'closed') {
      // open() owns failures until host.state completes, including a cloud
      // grant in flight. A retry here invalidated every slow grant's epoch.
      if (this.state.status !== 'connected') return;
      const cached = cachedConversation(this);
      this.epoch++; this.clearSession();
      // An established connection that drops starts the reconnect ladder.
      if (!this.deliberate) this.auto.retry();
      this.update({ status: notice.type === 'error' ? 'error' : 'offline', syncing: false,
        projects: [], sessions: [], devices: [], approvals: [], host: this.knownHost(),
        error: this.failure(notice.message ?? 'Connection closed. Reconnect to catch up.'), ...cached });
      if (notice.type === 'error') this.deps.rpc.close();
      return;
    }
    if (notice.type !== 'message' || this.state.status !== 'connected') return;
    const event = notice.payload;
    if (event?.event === 'conversation.updated') receiveConversation(this, event.data);
    if (event?.event === 'conversation.controlChanged' && event.data?.sessionId === this.state.selectedSessionId) {
      this.lease = null; this.update({ control: 'readonly' });
    }
    if (event?.event === 'conversation.resync' && this.state.conversation) {
      this.lease = null; this.update({ control: 'readonly' });
      void loadConversation(this, this.state.conversation.sessionId).catch(error => this.report(error));
    }
    if (event?.event === 'host.changed') void this.refresh().catch(() => {});
    if (event?.event === 'terminal.resync' && event.data?.sessionId === this.state.selectedSessionId) {
      void resnapshotSession(this);
    }
    if (event?.event === 'terminal.size' && event.data?.sessionId === this.state.selectedSessionId) {
      void hostResized(this, event.data);
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
