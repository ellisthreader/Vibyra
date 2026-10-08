import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

/** The AI account the Agent V2 Mac runner uses (ids only, never credentials). */
export interface AgentV2Selection {
  provider: "claude" | "codex" | "gemini";
  account: string;
  model: string;
  effort: string | null;
}

/** `starting`, `signed_out`, `no_selection`, `disabled`, `not_ready`,
 * `registering`, `idle`, `running`, `error`. */
export interface AgentV2RunnerStatus {
  state: string;
  provider: string | null;
  account: string | null;
  runtimeId: string | null;
  runId: string | null;
  detail: string | null;
}

/** False in the web preview and node tests, where there is no native runner. */
export function agentV2Available(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export function selectAgentV2Account(selection: AgentV2Selection): Promise<AgentV2RunnerStatus> {
  return invoke<AgentV2RunnerStatus>("agent_v2_select_account", { ...selection });
}

export function agentV2RunnerStatus(): Promise<AgentV2RunnerStatus> {
  return invoke<AgentV2RunnerStatus>("agent_v2_runner_status");
}

export function onAgentV2RunnerStatus(callback: (status: AgentV2RunnerStatus) => void): Promise<UnlistenFn> {
  return listen<AgentV2RunnerStatus>("agent-v2:runner-status", (event) => callback(event.payload));
}
