import { invoke } from "@tauri-apps/api/core";
import type { ResolvedAgent } from "../types";

export function listAgents(): Promise<ResolvedAgent[]> {
  return invoke("list_agents");
}
