import type { ActivityState } from "../lib/activity";
import type { ResolvedAgent, SafeWorkspaceRef, Visibility } from "../types";

export interface PaneState {
  id: number;
  persistenceId: string;
  projectId: string;
  agentId: string;
  title: string;
  model: string | null;
  permissionMode: "standard" | "full";
  reasoningEffort: string | null;
  sourceCwd: string | null;
  workspaceMode: "safe" | "shared";
  safeSnapshotFingerprint: string | null;
  customTitle: string | null;
  /** Chat-aware fallback for CLIs whose OSC title is only a cwd or spinner. */
  chatTitle: string | null;
  osc: string | null;
  accent: string;
  status: "running" | "exited" | "suspended";
  exitCode: number | null;
  visibility: Visibility;
  lastFocusedAt: number;
  /** Persisted history carried by a resumed pane; native output is appended on save. */
  snapshot?: string | null;
  /** The agent's own conversation id, for agents that accept one at launch. */
  agentSessionId: string | null;
  /**
   * The provider account this pane is running as; null for the first account
   * and for agents that have none. Fixed for the life of the process — a CLI
   * reads its credentials once — so it is what the pane's badge reports.
   */
  accountId: string | null;
  /**
   * The safe-mode worktree this pane runs in, or null for shared panes.
   * What the Review tool diffs, merges and discards.
   */
  workspace: SafeWorkspaceRef | null;
}

export interface SpawnAgentOptions {
  cwd?: string | null;
  model?: string | null;
  permissionMode?: "standard" | "full";
  reasoningEffort?: string | null;
  title?: string;
  customTitle?: string | null;
  chatTitle?: string | null;
  persistenceId?: string;
  workspaceMode?: "safe" | "shared";
  safeSnapshotFingerprint?: string;
  /** Take this pane's slot instead of appending, so grid order survives. */
  replaces?: number;
  /** Continue the agent's previous conversation instead of starting one. */
  resume?: boolean;
  /** Output from the run being resumed, shown above the new process's own. */
  replaySnapshot?: string | null;
  /** Reuse this conversation id instead of minting a new one. */
  agentSessionId?: string | null;
  /** Which provider account to run as; null means the first one. */
  accountId?: string | null;
}

/** Everything `spawnSsh` needs beyond the target and its project. */
export interface SpawnSshOptions {
  replaces?: number;
  replaySnapshot?: string | null;
  persistenceId?: string;
}

export interface TerminalStore {
  panes: PaneState[];
  focusedId: number | null;
  zoomedId: number | null;
  activity: Record<number, ActivityState>;
  spawnAgent: (
    agent: ResolvedAgent,
    projectId: string,
    options?: SpawnAgentOptions,
  ) => Promise<boolean>;
  spawnSsh: (
    target: string,
    projectId: string,
    options?: SpawnSshOptions,
  ) => Promise<boolean>;
  restart: (id: number) => Promise<void>;
  /** Relaunch one pane on a different provider account, in place. */
  switchAccount: (id: number, accountId: string | null) => Promise<void>;
  resume: (id: number) => Promise<void>;
  /** Replace a pane whose agent refused to continue its conversation. */
  recoverResume: (id: number) => Promise<void>;
  restoreSession: () => Promise<void>;
  close: (id: number) => Promise<void>;
  hibernate: (id: number) => Promise<void>;
  wake: (id: number) => Promise<void>;
  toggleZoom: (id: number) => void;
  setFocus: (id: number) => void;
  markFocused: (id: number) => void;
  rename: (id: number, title: string) => void;
  setChatTitle: (id: number, title: string, fromTranscript?: boolean) => void;
  setOsc: (id: number, title: string) => void;
  markExited: (id: number, code: number | null) => void;
  applyActivity: (next: Record<number, ActivityState>) => void;
}
