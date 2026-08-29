import { invoke } from "@tauri-apps/api/core";

import type {
  AgentPlace,
  AgentProfile,
  Engine,
  EngineCapabilities,
  PermissionMode,
  PlaceAccess,
  Reflection,
} from "../agentTypes";

// The roster and its grants. The account scope is resolved natively on every
// call, so nothing here passes one — a scope the renderer could set would make
// the account boundary a suggestion.

export function listAgents(): Promise<AgentProfile[]> {
  return invoke("agent_profile_list");
}

export function createAgent(request: {
  name: string;
  brief: string;
  engine: Engine;
}): Promise<AgentProfile> {
  return invoke("agent_profile_create", { request });
}

/** Every field is optional; absent means "leave it alone". */
export interface AgentChange {
  name?: string;
  brief?: string;
  model?: string | null;
  effort?: string | null;
  permission?: PermissionMode;
  memoryBudget?: number;
  reflection?: Reflection;
  accent?: string;
  mailEnabled?: boolean;
  routinesAllowed?: boolean;
}

export function updateAgent(id: string, change: AgentChange): Promise<AgentProfile> {
  return invoke("agent_profile_update", { id, change });
}

export function archiveAgent(id: string, archived: boolean): Promise<void> {
  return invoke("agent_profile_archive", { id, archived });
}

export function deleteAgent(id: string): Promise<void> {
  return invoke("agent_profile_delete", { id });
}

export function listPlaces(agentId: string): Promise<AgentPlace[]> {
  return invoke("agent_place_list", { agentId });
}

export function grantPlace(
  agentId: string,
  path: string,
  access: PlaceAccess,
): Promise<AgentPlace> {
  return invoke("agent_place_grant", { agentId, path, access });
}

export function revokePlace(agentId: string, placeId: string): Promise<void> {
  return invoke("agent_place_revoke", { agentId, placeId });
}

/** What the installed CLIs actually support on this machine. */
export function engineCapabilities(): Promise<EngineCapabilities[]> {
  return invoke("agent_engine_capabilities");
}
