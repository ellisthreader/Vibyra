import { invoke } from "@tauri-apps/api/core";

export interface SafeWorkspacePreflight {
  changedFiles: number;
  fingerprint: string;
}

export function inspectSafeWorkspace(projectRoot: string): Promise<SafeWorkspacePreflight> {
  return invoke("safe_workspace_preflight", { projectRoot });
}
