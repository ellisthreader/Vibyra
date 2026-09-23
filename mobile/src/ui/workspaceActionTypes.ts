import type { Snapshot } from '../state/output';
import type { TerminalEvent } from '../terminal/previewFeed';
import type { AccentId } from '../theme';
import type { ScaffoldActions } from '../scaffold/api';
import type {
  Account,
  AccountDeletion,
  AccountDevice,
  OnboardingMode,
  TwoFactorPrompt,
  TwoFactorSetup,
  TwoFactorState,
} from './accountTypes';
import type { FileEntry, Session, SessionKind, ThemePreference } from './types';

export interface WorkspacePreviewActions {
  /** Listed scopes were individually approved on the connected Mac. */
  listPreviews?(): Promise<{
    targets: {
      grantId: string;
      projectId: string;
      targetId: string;
      name?: string | null;
      running?: boolean;
    }[];
  }>;
  startPreview?(grantId: string): Promise<{ phase: string }>;
  openPreview?(grantId: string): Promise<{ url: string; close(): Promise<void> }>;
  vibesProjectRequest?(
    method: 'vibes.bind' | 'vibes.tool',
    params: Record<string, unknown> & { hostId: string; projectId: string },
  ): Promise<Record<string, unknown>>;
  /** Starting a project on the computer (the New project wizard). Absent where the computer cannot build one. */
  scaffold?: ScaffoldActions;
}
export interface WorkspaceComputerActions {
  connect(link: string): Promise<void>;
  reconnect?(): Promise<void>;
  disconnect(): void | Promise<void>;
  refresh(): Promise<void>;
  selectSession(id: string | null): void;
  createSession(projectId: string, kind: SessionKind, title: string): Promise<Session | void>;
  sendInput(data: string): Promise<void>;
}
export interface WorkspaceConversationActions {
  uploadConversationAttachment?(
    params: Record<string, unknown>,
  ): Promise<import('../conversation/attachmentUpload').ConversationAttachment>;
  conversationRequest?<T>(
    method: import('../state/conversationInspect').ConversationRead,
    params?: Record<string, unknown>,
  ): Promise<T>;
  setConversationSettings?(model: string, effort: string, revision: number): Promise<void>;
  submitTurn?(text: string, sendAsText?: boolean, attachments?: string[]): Promise<void>;
  interruptTurn?(): Promise<void>;
  loadEarlierConversation?(): Promise<void>;
  resolveDecision?(
    itemId: string,
    decision: 'accept' | 'decline' | 'acceptForSession',
  ): Promise<void>;
  answerQuestion?(itemId: string, answers: Record<string, string[]>): Promise<void>;
}
export interface WorkspaceTerminalActions {
  resize(cols: number, rows: number): void | Promise<void>;
  stopSession(id: string): Promise<void>;
  /** What a terminal is showing, read without opening it: no control taken, nothing resized. */
  peekSession?(id: string): Promise<Snapshot>;
  /** Every terminal's output as the computer streams it. Returns the way to stop listening. */
  followOutput?(listener: (event: TerminalEvent) => void): () => void;
}
export interface WorkspaceFilesActions {
  listFiles(projectId: string, path: string): Promise<{ entries: FileEntry[] }>;
  readFile(
    projectId: string,
    path: string,
  ): Promise<{ path: string; content: string; truncated: boolean }>;
  getDiff(projectId: string): Promise<{ diff: string; truncated: boolean }>;
}
export interface WorkspacePreferencesActions {
  setTheme(preference: ThemePreference): void;
  setAccent?(accent: AccentId): void;
  setTerminalFontSize?(size: number): void;
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
}
export interface WorkspaceAccountActions {
  signUp?(email: string, password: string): Promise<void>;
  /** Resolves null once signed in, or with the challenge an account's second factor asks for. */
  logIn?(email: string, password: string): Promise<TwoFactorPrompt | null>;
  providerLogIn?(provider: 'apple' | 'google', signal: AbortSignal): Promise<boolean>;
  /** Keeps a session another sign-in produced, such as connecting GitHub while signed out. */
  adoptSession?(session: { token: string; user: Account }): Promise<void>;
  logOut?(): Promise<void>;
  /** Asks the server for the account as it is now: plan, verification, photo. */
  refreshAccount?(): Promise<void>;
  // Emails a link to install Vibyra on a computer, and resolves with the address it
  // went to. A signed-in phone needs no argument; a guest passes the address typed.
  sendHostLink?(email?: string): Promise<string>;
  completeOnboarding?(mode: OnboardingMode | null): Promise<void>;
  resetOnboarding?(): Promise<void>;
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
}
export interface WorkspaceCloudActions {
  // Vibyra Cloud (src/state/remoteActions.ts): the account's computers, reachable
  // from any network. Absent where there is no cloud API, so nothing is offered.
  listComputers?(): Promise<import('../remote/remoteApi').CloudComputers>;
  /** Connects to one of the account's computers through the relay. */
  connectComputer?(hostId: string): Promise<void>;
}
export interface WorkspaceActions
  extends
    WorkspacePreviewActions,
    WorkspaceComputerActions,
    WorkspaceConversationActions,
    WorkspaceTerminalActions,
    WorkspaceFilesActions,
    WorkspacePreferencesActions,
    WorkspaceAccountActions,
    WorkspaceCloudActions {}
