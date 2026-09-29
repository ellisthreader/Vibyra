import type { ConversationSnapshot } from '../state/conversationTypes';
import type { AccentId } from '../theme';
import type { PreferencesApi } from '../vibes/preferencesApi';
import type { Account, OnboardingState } from './accountTypes';
import type { WorkspaceActions } from './workspaceActionTypes';
export type { WorkspaceActions } from './workspaceActionTypes';
export type ThemePreference = 'system' | 'light' | 'dark';
export type TerminalRunner = 'claude' | 'codex' | 'gemini' | 'qwen' | 'aider' | 'opencode';
export type SessionKind = 'shell' | 'vibyra' | TerminalRunner;
export type ConnectionStatus = 'offline' | 'connecting' | 'pairing' | 'connected' | 'error';
export interface Computer {
  id: string;
  name: string;
  platform: string;
  version?: string;
}
/** `filesAvailable` is additive: absent means "go by the connection's own viewOnly", the way every
 *  project behaved before it existed. A paired Vibyra Desktop sends it explicitly per project. */
export interface Project {
  id: string;
  name: string;
  path: string;
  branch?: string;
  filesAvailable?: boolean;
  /** What this project is when it is not a coding folder: a Vibyra Desktop vault of notes. */
  kind?: 'vault' | 'railway';
}
/** Whether the computer's own Railway CLI can answer for it: present and logged in, present but signed out, or absent. */
export interface RailwayStatus {
  status: 'ready' | 'signedOut' | 'missing';
  account: string | null;
}
export interface Session {
  id: string;
  projectId: string;
  title: string;
  kind: SessionKind;
  runner?: 'conversation';
  fundedChatId?: string;
  saved?: boolean;
  automatic?: TerminalLaunchOptions;
  resolvedAutoSession?: Session;
  autoProgress?: import('./autoSelectionState').AutoSelectionProgress;
  autoSelection?: { model: string; name: string; effort: string | null };
  readOnly?: boolean;
  /** This session accepts input from the phone. Absent on a computer that has
   *  not been given the typing switch, so every gate tests `=== true`. */
  canInput?: boolean;
  status: 'running' | 'exited' | 'interrupted';
  createdAt: string;
  exitCode?: number;
}
export interface TrustedDevice {
  id: string;
  name: string;
  current?: boolean;
  lastSeen?: string;
}
export interface Approval {
  id: string;
  title: string;
  detail: string;
  expiresAt?: string;
}
export interface FileEntry {
  path: string;
  name: string;
  kind: 'file' | 'directory';
  size: number;
}
export interface TerminalModel {
  efforts?: string[];
  id: string;
  name: string;
  kind: TerminalRunner;
  isNew: boolean;
}
export type TerminalPermission = 'standard' | 'full';
export interface TerminalLaunchOptions { automatic?: boolean; requestId?: string; effort?: string | null; source?: 'accounts' | 'vibyra'; budget?: number; tools?: boolean; safeMode?: boolean; model?: string; permissionMode?: TerminalPermission }
export interface TerminalModelCatalogue {
  runnerKinds?: TerminalRunner[];
  models: TerminalModel[];
  permissionModes?: TerminalPermission[];
  /** Both the native bridge and its renderer must support explicit permissions. */
  permissionsVersion?: number;
  effortVersion?: number;
}
export interface WorkspaceModel {
  remoteSecurity?: import('../remote/securityTypes').RemoteSecurityProgress;
  remoteAccess?: import('../remote/dashboardApi').RemoteDashboardApi;
  /** A paired Mac exposes safe CLI account status and gated account actions. */
  aiAccountsAvailable?: boolean;
  terminalModelsAvailable?: boolean;
  /** Gated by a native Preview adapter and an explicit Mac capability. */
  previewAvailable?: boolean;
  /** The computer can run a project's desktop app for Preview (`capabilities.previewRunV1`). */
  previewRunAvailable?: boolean;
  /** Response credit the Mac accepts ahead for Preview, in bytes (64 KiB on older Macs). */
  previewWindow?: number;
  /** Counts the Mac's `preview.changed` events: a local site started or stopped. */
  previewRevision?: number;
  /** The platform the last Preview list named (`hostPlatform`), for “your Mac/PC/computer”. */
  previewHost?: { hostId: string; platform: string } | null;
  vibesToolsAvailable?: boolean;
  fundedTerminalsAvailable?: boolean;
  /** The connected computer's Railway CLI, when it reports one at all. */
  railway?: RailwayStatus | null;
  /** The connected computer can start projects (`capabilities.scaffoldV1`). */
  scaffoldAvailable?: boolean;
  conversation?: ConversationSnapshot | null;
  conversationAvailable?: boolean;
  /** The agents that computer runs as a chat (`capabilities.conversationProviders`).
   *  A computer that says nothing runs Codex alone, as every earlier one did. */
  conversationProviders?: string[];
  demo?: boolean;
  syncing?: boolean;
  /** The whole connection only watches: a paired Vibyra Desktop, as opposed to
   *  a standalone Host. Nothing that starts or changes work is offered. */
  viewOnly?: boolean;
  /** That computer will accept typed input, even though it still refuses to
   *  start, stop or browse. Independent of `viewOnly`, which stays true. */
  canType?: boolean;
  focusedTextAvailable?: boolean;
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
  /** High-frequency terminal stream, subscribed to only by the terminal view. */
  terminalOutput?: { subscribe(callback: () => void): () => void; snapshot(): string };
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
  notifications?: import('../notifications/api').NotificationsApi;
  reports?: import('../report/api').ReportApi;
  /** A sample opened signed out: the stand-in account Settings shows so its Account pages can be tried. Memory only. */
  sampleAccount?: Account;
  actions: WorkspaceActions;
}
// Settings is not a destination: it is a sheet over whichever of these is on screen.
export type Destination = 'work' | 'integrations' | 'computers' | 'vibes';
export type {
  Account,
  AccountDeletion,
  AccountDevice,
  OnboardingMode,
  OnboardingState,
  TwoFactorPrompt,
  TwoFactorSetup,
  TwoFactorState,
} from './accountTypes';
