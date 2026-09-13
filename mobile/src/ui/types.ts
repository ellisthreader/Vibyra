import type { ConversationSnapshot } from '../state/conversationTypes';
export type ThemePreference = 'system' | 'light' | 'dark';
export type SessionKind = 'shell' | 'claude' | 'codex';
export type ConnectionStatus = 'offline' | 'connecting' | 'pairing' | 'connected' | 'error';
export interface Computer { id: string; name: string; platform: string; version?: string }
export interface Project { id: string; name: string; path: string; branch?: string }
export interface Session {
  id: string;
  projectId: string;
  title: string;
  kind: SessionKind;
  runner?: 'conversation';
  readOnly?: boolean;
  /** This session accepts input from the phone. Absent on a computer that has
   *  not been given the typing switch, so every gate tests `=== true`. */
  canInput?: boolean;
  status: 'running' | 'exited' | 'interrupted';
  createdAt: string;
  exitCode?: number;
}
export interface TrustedDevice { id: string; name: string; current?: boolean; lastSeen?: string }
export interface Approval { id: string; title: string; detail: string; expiresAt?: string }
export interface FileEntry { path: string; name: string; kind: 'file' | 'directory'; size: number }
export interface WorkspaceActions {
  vibesProjectRequest?(method: 'vibes.bind' | 'vibes.tool', params: Record<string, unknown> & { hostId: string; projectId: string }): Promise<Record<string, unknown>>;
  connect(link: string): Promise<void>;
  reconnect?(): Promise<void>;
  disconnect(): void | Promise<void>;
  refresh(): Promise<void>;
  selectSession(id: string | null): void;
  createSession(projectId: string, kind: SessionKind, title: string): Promise<Session | void>;
  sendInput(data: string): Promise<void>;
  submitTurn?(text: string): Promise<void>;
  interruptTurn?(): Promise<void>;
  loadEarlierConversation?(): Promise<void>;
  resolveDecision?(itemId: string, decision: 'accept' | 'decline'): Promise<void>;
  answerQuestion?(itemId: string, answers: Record<string, string[]>): Promise<void>;
  resize(cols: number, rows: number): void | Promise<void>;
  stopSession(id: string): Promise<void>;
  listFiles(projectId: string, path: string): Promise<{ entries: FileEntry[] }>;
  readFile(projectId: string, path: string): Promise<{ path: string; content: string; truncated: boolean }>;
  getDiff(projectId: string): Promise<{ diff: string; truncated: boolean }>;
  setTheme(preference: ThemePreference): void;
  forgetDevice?(): Promise<void>;
  revokeDevice?(id: string): Promise<void>;
  resolveApproval?(id: string, allow: boolean): Promise<void>;
  claimControl?(): Promise<void>;
  enterDemo?(): void;
  signInDemo?(): void;
  exitDemo?(): void;
  signUp?(email: string, password: string): Promise<void>;
  logIn?(email: string, password: string): Promise<void>;
  providerLogIn?(provider: 'apple' | 'google', signal: AbortSignal): Promise<boolean>;
  /** Keeps a session another sign-in produced, such as connecting GitHub while signed out. */
  adoptSession?(session: { token: string; user: Account }): Promise<void>;
  logOut?(): Promise<void>;
  // Emails a link to install Vibyra on a computer, and resolves with the address it
  // went to. A signed-in phone needs no argument; a guest passes the address typed.
  sendHostLink?(email?: string): Promise<string>;
  completeOnboarding?(mode: OnboardingMode | null): Promise<void>;
  resetOnboarding?(): Promise<void>;
  setTerminalFontSize?(size: number): void;
}
export interface WorkspaceModel {
  vibesToolsAvailable?: boolean;
  conversation?: ConversationSnapshot | null;
  conversationAvailable?: boolean;
  demo?: boolean;
  syncing?: boolean;
  /** The whole connection only watches: a paired Vibyra Desktop, as opposed to
   *  a standalone Host. Nothing that starts or changes work is offered. */
  viewOnly?: boolean;
  /** That computer will accept typed input, even though it still refuses to
   *  start, stop or browse. Independent of `viewOnly`, which stays true. */
  canType?: boolean;
  control?: 'none' | 'claiming' | 'ready' | 'readonly';
  status: ConnectionStatus;
  /** Not connected, but on its way back by itself: the app is working through
   *  its retry ladder rather than waiting to be asked. */
  reconnecting?: boolean;
  error: string | null;
  host: Computer | null;
  // Where the computer was reached, as host:port from the pairing URL. The Host
  // never reports its own address, so this comes from the pairing this phone holds.
  hostAddress?: string | null;
  projects: Project[];
  sessions: Session[];
  devices: TrustedDevice[];
  approvals: Approval[];
  selectedSessionId: string | null;
  output: string;
  /** The type size a person pinched the terminal to, kept so reopening a
   *  session does not throw the size away. */
  terminalFontSize?: number;
  themePreference: ThemePreference;
  onboarding: OnboardingState;
  account: Account | null;
  actions: WorkspaceActions;
}
export type Destination = 'work' | 'projects' | 'integrations' | 'computers' | 'vibes' | 'settings';
export type OnboardingMode = 'computer' | 'phone';
export interface OnboardingState { status: 'unknown' | 'pending' | 'complete'; mode: OnboardingMode | null }
export interface Account { email: string; name: string; plan: string }
