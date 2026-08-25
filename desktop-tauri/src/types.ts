// Mirrors the serde shapes exported by the Rust core (camelCase renames).

import type { NotificationPrefs } from "./notificationTypes";

export type { CapturedScreenshot, ClipboardPaste, Screenshot, VoiceStatus } from "./toolTypes";

export type Visibility = "visible" | "background" | "hidden" | "hibernated";

export interface SessionInfo {
  id: number;
  agentId: string;
  title: string;
  program: string;
  cwd: string | null;
  visibility: Visibility;
  alive: boolean;
  exitCode: number | null;
}

export interface AgentSpec {
  id: string;
  name: string;
  program: string;
  args: string[];
  env: [string, string][];
  accent: string;
  description: string;
  custom: boolean;
}

export interface ResolvedAgent extends AgentSpec {
  installed: boolean;
}

export type AccountStatus =
  | "restoring"
  | "signedOut"
  | "authorizing"
  | "signedIn"
  | "connectionError";

export interface AccountProfile {
  name: string;
  email: string;
  provider: string;
  plan: string;
  emailVerified: boolean;
  welcomeKey: string;
}

export interface AccountSnapshot {
  status: AccountStatus;
  profile: AccountProfile | null;
  error: string | null;
  pendingProvider: string | null;
  secureStorage: boolean;
}

export interface DirEntryInfo {
  name: string;
  path: string;
  isDir: boolean;
  size: number;
  modifiedMs: number | null;
}

export interface FilePreview {
  path: string;
  content: string;
  size: number;
  truncated: boolean;
}

export interface FsChange {
  path: string;
  kind: "create" | "modify" | "remove";
}

export interface ProjectSpec {
  id: string;
  name: string;
  root: string;
  color: string;
  lastOpenedMs: number;
}

export type RendererMode = "auto" | "accelerated" | "compatibility";

export interface RendererPolicy {
  mode: RendererMode;
  softwareCompositing: boolean;
  nvidiaSession: boolean;
  configurable: boolean;
  environmentOverride: boolean;
  /** Startup rewrote a promoted NVIDIA "accelerated" mode back to "auto". */
  healedThisLaunch: boolean;
}

export interface Settings {
  theme: "auto" | "dark" | "light";
  fontSize: number;
  fontFamily: string;
  scrollbackLines: number;
  defaultShell: string | null;
  workspaceRoot: string | null;
  screenshotDir: string | null;
  /** Hide Vibyra for the length of the grab instead of capturing it. */
  screenshotHideWindow: boolean;
  openaiKeyConfigured: boolean;
  secureStorageAvailable: boolean;
  voiceShortcut: string;
  screenshotShortcut: string;
  /** WebKit compositing policy (Linux only); applies on next launch. */
  rendererMode: RendererMode;
  /** One-shot marker: the promoted-accelerated repair already ran here. */
  rendererAccelHealDone: boolean;
  /** Skip decorative animation regardless of the OS reduced-motion setting. */
  reduceMotion: boolean;
  enabledAgentIds: string[];
  aiDailyCallCap: number;
  aiHourlyCallCap: number;
  aiDailySpendCapUsd: number;
  aiMonthlySpendCapUsd: number;
  persistTerminalScrollback: boolean;
  /** Toasts, sounds and system notifications. See notificationTypes.ts. */
  notifications: NotificationPrefs;
  customAgents: AgentSpec[];
  projects: ProjectSpec[];
  activeProjectId: string | null;
}

export type TermEvent =
  | { type: "output"; data: string }
  | { type: "resync"; data: string }
  | { type: "exit"; code: number | null };

export interface AiLimits {
  dailyCalls: number;
  hourlyCalls: number;
  dailySpendUsd: number;
  monthlySpendUsd: number;
}

export interface AiUsage {
  day: string;
  month: string;
  callsToday: number;
  chatCallsToday: number;
  voiceCallsToday: number;
  inputTokensToday: number;
  outputTokensToday: number;
  voiceSecondsToday: number;
  spendTodayUsd: number;
  callsThisMonth: number;
  spendMonthUsd: number;
  callsLastMinute: number;
  callsLastHour: number;
}

export interface AiPricing {
  chatModel: string;
  voiceModel: string;
  chatInputUsdPerMtok: number;
  chatOutputUsdPerMtok: number;
  voiceUsdPerMinute: number;
}

export interface AiServiceStatus {
  keyConfigured: boolean;
  /** Masked fragment such as "sk-…wxyz" — never the whole key. */
  keyHint: string | null;
  secureStorageAvailable: boolean;
  recorderAvailable: boolean;
  keyPageUrl: string;
  limits: AiLimits;
  usage: AiUsage;
  pricing: AiPricing;
}
