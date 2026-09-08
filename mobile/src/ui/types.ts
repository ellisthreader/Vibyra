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
  status: 'running' | 'exited' | 'interrupted';
  createdAt: string;
  exitCode?: number;
}
export interface TrustedDevice { id: string; name: string; current?: boolean; lastSeen?: string }
export interface Approval { id: string; title: string; detail: string; expiresAt?: string }
export interface FileEntry { path: string; name: string; kind: 'file' | 'directory'; size: number }
export interface WorkspaceActions {
  connect(link: string): Promise<void>;
  reconnect?(): Promise<void>;
  disconnect(): void | Promise<void>;
  refresh(): Promise<void>;
  selectSession(id: string | null): void;
  createSession(projectId: string, kind: SessionKind, title: string): Promise<Session | void>;
  sendInput(data: string): Promise<void>;
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
  exitDemo?(): void;
  signUp?(email: string, password: string): Promise<void>;
  logIn?(email: string, password: string): Promise<void>;
  logOut?(): Promise<void>;
  completeOnboarding?(mode: OnboardingMode | null): Promise<void>;
  resetOnboarding?(): Promise<void>;
}
export interface WorkspaceModel {
  demo?: boolean;
  syncing?: boolean;
  control?: 'none' | 'claiming' | 'ready' | 'readonly';
  status: ConnectionStatus;
  error: string | null;
  host: Computer | null;
  projects: Project[];
  sessions: Session[];
  devices: TrustedDevice[];
  approvals: Approval[];
  selectedSessionId: string | null;
  output: string;
  themePreference: ThemePreference;
  onboarding: OnboardingState;
  account: Account | null;
  actions: WorkspaceActions;
}
export type Destination = 'work' | 'projects' | 'computers' | 'settings';
export type OnboardingMode = 'computer' | 'phone';
export interface OnboardingState { status: 'unknown' | 'pending' | 'complete'; mode: OnboardingMode | null }
export interface Account { email: string; name: string; plan: string }
