// Mirrors the serde shapes exported by the Rust core (camelCase renames).

import type { PerformanceMode } from "./lib/performanceMode";
import type { NotificationPrefs } from "./notificationTypes";

import type { AgentSpec } from "./agentTypes";

export type { AgentInstallHint, AgentSpec, ResolvedAgent } from "./agentTypes";
export type { CapturedScreenshot, ClipboardPaste, Screenshot, SpeechVoice, VoiceLevel, VoiceStatus } from "./toolTypes";
export type {
  AccountDevice,
  AccountProfile,
  AccountSnapshot,
  AccountStatus,
  CreditsSummary,
  TopupOption,
  TwoFactorSetup,
  TwoFactorState,
} from "./accountTypes";

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

/** What the assistant is told about a project. `shape` is how much of a
 * project the folder actually is: `plain` means no build, test or run command
 * should be invented for it. Built natively — see `ipc/projectBrief.ts`. */
export interface ProjectBrief {
  text: string;
  shape: "repository" | "folder" | "plain" | "missing";
  codebase: boolean;
  chars: number;
  /** Sections the budget cut short, named so the brief never lies by omission. */
  truncated: string[];
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
  /** Desktop presentation only; iPhone conversations always use native chat. */
  agentView: "terminal" | "chat";
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
  /** Whether the assistant is told what is in the project it is asked about.
   * On by default; off leaves it the project's name and folder and nothing
   * else. See `lib/chatPrompt.ts`. */
  sendProjectContext: boolean;
  voiceShortcut: string;
  screenshotShortcut: string;
  /** Opens a spoken conversation with the workspace assistant. */
  talkShortcut: string;
  /** Which of Vibyra's own voices reads replies; empty is the default one. */
  speechVoice: string;
  /** Multiplier on that voice's natural pace. 1 is unchanged. */
  speechRate: number;
  /** A sentence steering delivery, e.g. "warm and unhurried". Empty leaves
   * the voice as it comes. */
  speechStyle: string;
  /** ISO-639-1 code dictation should expect; empty lets it detect. */
  voiceLanguage: string;
  /** How long a pause ends your turn in a spoken conversation, in ms. */
  talkPauseMs: number;
  /** WebKit compositing policy (Linux only); applies on next launch. */
  rendererMode: RendererMode;
  enabledAgentIds: string[];
  aiDailyCallCap: number;
  aiHourlyCallCap: number;
  aiDailySpendCapUsd: number;
  aiMonthlySpendCapUsd: number;
  /** How much work the app does to look good: a ladder, not a switch —
   * "full", "balanced" or "best". See lib/performanceMode.ts, and note this
   * is a different axis from `rendererMode`. */
  performanceMode: PerformanceMode;
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
  /** The key came from OPENAI_API_KEY, not from the credential store. */
  keyFromEnvironment: boolean;
  /** Masked fragment such as "sk-…wxyz" — never the whole key. */
  keyHint: string | null;
  secureStorageAvailable: boolean;
  recorderAvailable: boolean;
  keyPageUrl: string;
  limits: AiLimits;
  usage: AiUsage;
  pricing: AiPricing;
}
