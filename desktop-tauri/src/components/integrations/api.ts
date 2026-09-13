import { invoke } from "@tauri-apps/api/core";
import type { IntegrationRequest } from "./types";

export function integrationRequest<T>(agentId: string, request: IntegrationRequest): Promise<T> {
  return invoke("integration_request", { agentId, request });
}
