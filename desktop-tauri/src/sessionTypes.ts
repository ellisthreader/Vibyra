// Wire shapes for session.json, mirroring src-tauri/src/session_store.rs.

/** One pane as written to session.json. `id` is 0 for an already-suspended pane. */
export interface PersistedPane {
  id: number;
  /** Stable across app launches even though native PTY ids restart at one. */
  persistenceId: string;
  projectId: string;
  agentId: string;
  title: string;
  customTitle: string | null;
  chatTitle: string | null;
  model: string | null;
  permissionMode: "standard" | "full";
  reasoningEffort: string | null;
  sourceCwd: string | null;
  workspaceMode: "safe" | "shared";
  accent: string;
  snapshot: string | null;
  /** The agent's own conversation id, so Resume can name exactly this one. */
  agentSessionId: string | null;
  /** The provider account it ran as, so it resumes on the same login. */
  accountId: string | null;
}

export interface TerminalSession {
  version: number;
  savedAtMs: number;
  panes: PersistedPane[];
}
