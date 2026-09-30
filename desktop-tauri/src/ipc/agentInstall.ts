import { invoke } from "@tauri-apps/api/core";
import type { ResolvedAgent } from "../types";

export interface AgentInstall {
  running: boolean;
  error: string | null;
}

/** Starts `npm install --global` for an agent. Resolves once the install is
 * running, not once it has finished; watch `agentInstalls` for the outcome. */
export function installAgentCli(agent: string): Promise<void> {
  return invoke("install_agent_cli", { agent });
}

export function agentInstalls(): Promise<Record<string, AgentInstall>> {
  return invoke("agent_installs");
}

export function clearAgentInstall(agent: string): Promise<void> {
  return invoke("clear_agent_install", { agent });
}

/** Re-resolves every agent against PATH, for right after an install lands. */
export function refreshAgents(): Promise<ResolvedAgent[]> {
  return invoke("refresh_agents");
}
