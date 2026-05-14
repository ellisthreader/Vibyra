export type AgentBusyInfo = {
  reason?: "active-run" | "lock" | string;
  message?: string | null;
  runId?: string | null;
  title?: string | null;
  model?: string | null;
  projectId?: string | null;
  projectName?: string | null;
  projectPath?: string | null;
  state?: string | null;
  progress?: number | null;
  file?: string | null;
  startedAt?: string | null;
  updatedAt?: string | null;
  elapsedSeconds?: number | null;
};
