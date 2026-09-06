import { invoke } from "@tauri-apps/api/core";
import type { AgentRun, RunArtifact } from "../agentRunTypes";

export const listRuns = (chatId: string | null = null): Promise<AgentRun[]> =>
  invoke("agent_run_list", { chatId });
export const runArtifacts = (runId: string): Promise<RunArtifact[]> =>
  invoke("agent_run_artifacts", { runId });
export const getRun = (runId: string): Promise<AgentRun> =>
  invoke("agent_run_get", { runId });
