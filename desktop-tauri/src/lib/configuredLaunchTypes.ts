import type { ResolvedAgent } from "../types";
import type { LaunchEffort } from "../state/launchSettingsStore";
import type { AgentView } from "./launchRoute";

export interface LaunchOptions {
  safeMode?: boolean;
  requestId?: string;
  phoneRequestId?: string;
  model?: string | null;
  reasoningEffort?: LaunchEffort;
  reasoningEnabled?: boolean;
  /** Overrides Launch setup when asked ("full permissions"); still only where supported. */
  permissionMode?: "standard" | "full";
  title?: string;
  /**
   * Terminals to open. Defaults to one: the project's `terminalCount`
   * preference belongs to the Launch setup button that spells it out
   * ("Launch 4 terminals"), and must not be inherited by the picker or the
   * quick chips, where a single click reads as a single terminal.
   */
  count?: number;
  /**
   * Which presentation the launch is for, when it is not this Mac's own
   * Settings > General > Agent view. A phone asks for Chat: its page is the
   * conversation itself, so a Claude or Gemini launch it asked for must run
   * through the conversation engine, never a PTY it can only watch.
   */
  view?: AgentView;
}
export interface PreparedLaunch {
  requestId?: string;
  phoneRequestId?: string;
  agent: ResolvedAgent;
  projectId: string;
  projectRoot: string;
  count: number;
  model: string | null;
  permissionMode: "standard" | "full";
  reasoningEffort: LaunchEffort | null;
  title?: string;
  safeMode: boolean;
  accountId: string | null;
  view?: AgentView;
}
