import type { AgentPlace, Engine, PermissionMode } from "./agentTypes";

export type RunStatus = "running" | "waiting" | "succeeded" | "failed" | "cancelled" | "interrupted";
export interface RunSpec {
  agentName: string;
  engine: Engine;
  model: string | null;
  effort: string | null;
  accountId: string | null;
  permission: PermissionMode;
  cwd: string;
  places: AgentPlace[];
  prompt: string;
  context: string;
  contextFingerprint: string;
  providerVersion: string;
  timeoutMs: number;
  maxToolCalls: number;
}
export interface AgentRun {
  id: string;
  account: string;
  chatId: string;
  agentId: string | null;
  status: RunStatus;
  spec: RunSpec;
  startedMs: number;
  endedMs: number | null;
  message: string | null;
}
export interface RunOutcome { status: RunStatus; message: string | null }
export interface RunArtifact {
  id: string;
  runId: string;
  kind: string;
  title: string;
  content: string;
  createdMs: number;
}
export const activeRun = (run: AgentRun): boolean => run.status === "running" || run.status === "waiting";
