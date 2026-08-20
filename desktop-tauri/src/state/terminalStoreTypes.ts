import type { ActivityState } from "../lib/activity";
import type { ResolvedAgent, Visibility } from "../types";

export interface PaneState {
  id: number;
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
  osc: string | null;
  accent: string;
  status: "running" | "exited" | "suspended";
  exitCode: number | null;
  visibility: Visibility;
  lastFocusedAt: number;
  /** Restored output for a suspended pane; absent once it is running. */
  snapshot?: string | null;
}

export interface SpawnAgentOptions {
  cwd?: string | null;
  model?: string | null;
  permissionMode?: "standard" | "full";
  reasoningEffort?: string | null;
  title?: string;
  workspaceMode?: "safe" | "shared";
  safeSnapshotFingerprint?: string;
  /** Take this pane's slot instead of appending, so grid order survives. */
  replaces?: number;
}

export interface TerminalStore {
  panes: PaneState[];
  focusedId: number | null;
  zoomedId: number | null;
  activity: Record<number, ActivityState>;
  spawnAgent: (agent: ResolvedAgent, projectId: string, options?: SpawnAgentOptions) => Promise<void>;
  spawnSsh: (target: string, projectId: string) => Promise<void>;
  restart: (id: number) => Promise<void>;
  resume: (id: number) => Promise<void>;
  restoreSession: () => Promise<void>;
  close: (id: number) => Promise<void>;
  hibernate: (id: number) => Promise<void>;
  wake: (id: number) => Promise<void>;
  toggleZoom: (id: number) => void;
  setFocus: (id: number) => void;
  markFocused: (id: number) => void;
  rename: (id: number, title: string) => void;
  setOsc: (id: number, title: string) => void;
  markExited: (id: number, code: number | null) => void;
  applyActivity: (next: Record<number, ActivityState>) => void;
}
