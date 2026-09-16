import type { ConversationSnapshot } from '../state/conversationTypes';
import type { Snapshot } from '../state/output';
import type { TerminalEvent } from '../terminal/previewFeed';
import type { AccentId } from '../theme';
import type { PreferencesApi } from '../vibes/preferencesApi';
import type { ScaffoldActions } from '../scaffold/api';
import type { TwoFactorPrompt, TwoFactorSetup, TwoFactorState } from '../account/twoFactorApi';
export type ThemePreference = 'system' | 'light' | 'dark';
export type SessionKind = 'shell' | 'claude' | 'codex';
export type ConnectionStatus = 'offline' | 'connecting' | 'pairing' | 'connected' | 'error';
export interface Computer { id: string; name: string; platform: string; version?: string }
/** `filesAvailable` is additive: absent means "go by the connection's own viewOnly", the way every
 *  project behaved before it existed. A paired Vibyra Desktop sends it explicitly per project. */
export interface Project { id: string; name: string; path: string; branch?: string; filesAvailable?: boolean;
  /** What this project is when it is not a coding folder: a Vibyra Desktop vault of notes. */
  kind?: 'vault' }
/** Whether the computer's own Railway CLI can answer for it: present and logged in, present but signed out, or absent. */
export interface RailwayStatus { status: 'ready' | 'signedOut' | 'missing'; account: string | null }
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
  /** Starting a project on the computer (the New project wizard). Absent where the computer cannot build one. */
  scaffold?: ScaffoldActions;
  connect(link: string): Promise<void>;
  reconnect?(): Promise<void>;
  disconnect(): void | Promise<void>;
  refresh(): Promise<void>;
  selectSession(id: string | null): void;
  createSession(projectId: string, kind: SessionKind, title: string): Promise<Session | void>;
  sendInput(data: string): Promise<void>;
  uploadConversationAttachment?(params: Record<string, unknown>): Promise<import('../conversation/attachmentUpload').ConversationAttachment>;
  conversationRequest?<T>(method: import('../state/conversationInspect').ConversationRead, params?: Record<string, unknown>): Promise<T>;
  setConversationSettings?(model: string, effort: string, revision: number): Promise<void>;
  submitTurn?(text: string, sendAsText?: boolean, attachments?: string[]): Promise<void>;
  interruptTurn?(): Promise<void>;
  loadEarlierConversation?(): Promise<void>;
  resolveDecision?(itemId: string, decision: 'accept' | 'decline' | 'acceptForSession'): Promise<void>;
  answerQuestion?(itemId: string, answers: Record<string, string[]>): Promise<void>;
  resize(cols: number, rows: number): void | Promise<void>;
  stopSession(id: string): Promise<void>;
  /** What a terminal is showing, read without opening it: no control taken, nothing resized. */
  peekSession?(id: string): Promise<Snapshot>;
  /** Every terminal's output as the computer streams it. Returns the way to stop listening. */
  followOutput?(listener: (event: TerminalEvent) => void): () => void;
  listFiles(projectId: string, path: string): Promise<{ entries: FileEntry[] }>;
  readFile(projectId: string, path: string): Promise<{ path: string; content: string; truncated: boolean }>;
  getDiff(projectId: string): Promise<{ diff: string; truncated: boolean }>;
  setTheme(preference: ThemePreference): void;
  setAccent?(accent: AccentId): void;
  forgetDevice?(): Promise<void>;
  revokeDevice?(id: string): Promise<void>;
  /** Renames a shared project. The folder on the computer keeps its own name. */
  renameProject?(projectId: string, name: string): Promise<void>;
  /** Stops sharing a folder. Nothing on the computer is deleted. */
  forgetProject?(projectId: string): Promise<void>;
  resolveApproval?(id: string, allow: boolean): Promise<void>;
  claimControl?(): Promise<void>;
  enterDemo?(): void;
  signInDemo?(): void;
  exitDemo?(): void;
  signUp?(email: string, password: string): Promise<void>;
  /** Resolves null once signed in, or with the challenge an account's second factor asks for. */
  logIn?(email: string, password: string): Promise<TwoFactorPrompt | null>;
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
  // The signed-in account's own settings (src/account/profileActions.ts). The sample has none.
  updateProfile?(changes: { name?: string; email?: string }): Promise<void>;
  setAvatar?(uri: string): Promise<void>;
  removeAvatar?(): Promise<void>;
  loadAccountDevices?(): Promise<AccountDevice[]>;
  /** Signs this phone out too when the device removed is this one. */
  removeAccountDevice?(id: string): Promise<void>;
  signOutEverywhere?(): Promise<void>;
  sendPasswordReset?(): Promise<string>;
  resendVerification?(): Promise<string>;
  /** Resolves true once the account is gone and this phone is signed out; false if cancelled. */
  deleteAccount?(proof: AccountDeletion, signal?: AbortSignal): Promise<boolean>;
  /** A card subscription's Stripe portal, as a one-time https URL to open. */
  openBillingPortal?(): Promise<string>;
  // The second factor (src/account/twoFactorActions.ts). Absent wherever it cannot be
  // set up at all -- the sample, the tests -- so Settings simply does not offer the row.
  loadTwoFactor?(): Promise<TwoFactorState>;
  /** A new secret and its setup link. Nothing is gated until `confirmTwoFactor`. */
  startTwoFactor?(): Promise<TwoFactorSetup>;
  /** The first code from the app; resolves with the recovery codes, shown once. */
  confirmTwoFactor?(code: string): Promise<string[]>;
  newRecoveryCodes?(code: string): Promise<string[]>;
  /** Takes a code from the app or a recovery code, never the password. */
  disableTwoFactor?(code: string): Promise<void>;
  /** The second half of a login the password only got a challenge for. */
  submitTwoFactorCode?(challengeId: string, code: string): Promise<void>;
  // Vibyra Cloud (src/state/remoteActions.ts): the account's computers, reachable
  // from any network. Absent where there is no cloud API, so nothing is offered.
  listComputers?(): Promise<import('../remote/remoteApi').CloudComputers>;
  /** Connects to one of the account's computers through the relay. */
  connectComputer?(hostId: string): Promise<void>;
}
export interface WorkspaceModel {
  vibesToolsAvailable?: boolean;
  /** The connected computer's Railway CLI, when it reports one at all. */
  railway?: RailwayStatus | null;
  /** The connected computer can start projects (`capabilities.scaffoldV1`). */
  scaffoldAvailable?: boolean;
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
  /** That computer will start a terminal in one of its projects, and close one,
   *  when asked from here — a Vibyra Desktop with typing switched on. Absent on
   *  a Mac that predates it, so every gate tests `=== true`. */
  canManage?: boolean;
  control?: 'none' | 'claiming' | 'ready' | 'readonly';
  status: ConnectionStatus;
  /** Not connected, but on its way back by itself: the app is working through
   *  its retry ladder rather than waiting to be asked. */
  reconnecting?: boolean;
  error: string | null;
  host: Computer | null;
  // Where the computer was reached, as host:port from the pairing URL. The Host
  // never reports its own address, so this comes from the pairing this phone holds.
  // Null through the cloud: the relay's address says nothing about the computer.
  hostAddress?: string | null;
  /** Reached through Vibyra Cloud rather than on this network. */
  throughCloud?: boolean;
  projects: Project[];
  /** What the paired computer was last seen sharing, kept on the phone so the
   *  Projects page has something to show while that computer is away. A memory,
   *  never a live list: every action on one still needs the computer. */
  remembered?: { projects: Project[]; seenAt: string } | null;
  sessions: Session[];
  devices: TrustedDevice[];
  approvals: Approval[];
  selectedSessionId: string | null;
  output: string;
  /** The grid the computer says the open terminal is drawn for, or null when
   *  it has not said. A Mac pane is drawn at exactly this grid and zoomed; a
   *  Host's history is laid out at it before being reflowed to this phone. */
  hostGrid?: { cols: number; rows: number } | null;
  /** The type size a person pinched the terminal to, kept so reopening a
   *  session does not throw the size away. */
  terminalFontSize?: number;
  themePreference: ThemePreference;
  /** The interaction colour, kept beside the theme in the same store. Absent reads as Cobalt. */
  accent?: AccentId;
  onboarding: OnboardingState;
  account: Account | null;
  /** Settings > Personality and Memory, asked with the Vibes chat's own bearer. The sample's keeps them in memory. */
  preferences?: PreferencesApi;
  /** A sample opened signed out: the stand-in account Settings shows so its Account pages can be tried. Memory only. */
  sampleAccount?: Account;
  actions: WorkspaceActions;
}
// Settings is not a destination: it is a sheet over whichever of these is on screen.
export type Destination = 'work' | 'projects' | 'integrations' | 'computers' | 'vibes';
export type OnboardingMode = 'computer' | 'phone';
export interface OnboardingState { status: 'unknown' | 'pending' | 'complete'; mode: OnboardingMode | null }
export interface Account { email: string; name: string; plan: string; avatarUrl?: string | null;
  provider?: 'email' | 'apple' | 'google' | 'github'; emailVerified?: boolean;
  /** Whether the account asks for a code as well as its password, when the server says. */
  twoFactorEnabled?: boolean;
  /** When the account was made, and how its plan is billed — present only when the server sends them. */
  createdAt?: string; planBillingCycle?: 'monthly' | 'annual'; planRenewsAt?: string | null; membershipEndsAt?: string | null;
  membershipCancelAtPeriodEnd?: boolean; billingProvider?: string | null; canManageStripeBilling?: boolean }
/** One place the account is signed in: a phone, a computer or a browser. */
export type { TwoFactorPrompt, TwoFactorSetup, TwoFactorState } from '../account/twoFactorApi';
export interface AccountDevice { id: string; name: string; location: string; current: boolean; lastActive: string | null }
/** How an account proves it is theirs before it is deleted: its password, or its provider again. */
export type AccountDeletion = { password: string } | { provider: 'apple' | 'google' | 'github' };
