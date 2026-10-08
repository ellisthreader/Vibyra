import { invoke } from "@tauri-apps/api/core";

export interface SafeWorkspacePreflight {
  /** False when the folder is not a Git repository, so Safe mode cannot apply. */
  repository: boolean;
  changedFiles: number;
  fingerprint: string;
}

export function inspectSafeWorkspace(projectRoot: string): Promise<SafeWorkspacePreflight> {
  return invoke("safe_workspace_preflight", { projectRoot });
}

/**
 * Whether Safe mode has a Git repository to branch from in this folder.
 * Cheap enough to ask on every project switch, and it needs no GitHub
 * connection: a plain folder must be able to say Safe mode is not for it.
 */
export function safeWorkspaceSupported(projectRoot: string): Promise<boolean> {
  return invoke("safe_workspace_supported", { projectRoot });
}

/**
 * Makes the folder a Git repository with one commit, so Safe mode has
 * something to branch from. Nothing is pushed and no remote is added.
 */
export function setUpGitRepository(projectRoot: string): Promise<void> {
  return invoke("set_up_git_repository", { projectRoot });
}
