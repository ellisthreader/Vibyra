// Mirrors the serde shapes exported by the Rust core (camelCase renames).

export type { CapturedScreenshot, Screenshot, VoiceStatus } from "./toolTypes";

export type Visibility = "visible" | "hidden" | "hibernated";

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

export type ProviderAccountStatus =
  | "connected"
  | "connecting"
  | "sign-in-required"
  | "not-installed"
  | "error";

export interface ProviderAccount {
  id: "codex" | "claude" | "gemini";
  company: string;
  product: string;
  runtimeId: string;
  installed: boolean;
  status: ProviderAccountStatus;
  accountLabel: string;
  detail: string;
  signInPageAvailable: boolean;
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
  enabledAgentIds: string[];
  aiDailyCallCap: number;
  aiHourlyCallCap: number;
  aiDailySpendCapUsd: number;
  aiMonthlySpendCapUsd: number;
  persistTerminalScrollback: boolean;
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

/** One pane as written to session.json. `id` is 0 for an already-suspended pane. */
export interface PersistedPane {
  id: number;
  projectId: string;
  agentId: string;
  title: string;
  customTitle: string | null;
  model: string | null;
  permissionMode: "standard" | "full";
  reasoningEffort: string | null;
  sourceCwd: string | null;
  workspaceMode: "safe" | "shared";
  accent: string;
  snapshot: string | null;
}

export interface TerminalSession {
  version: number;
  savedAtMs: number;
  panes: PersistedPane[];
}
