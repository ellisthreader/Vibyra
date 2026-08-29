import { invoke } from "@tauri-apps/api/core";

export interface DiskUsage {
  bytes: number;
  /** False when the native walk hit its ceiling, which makes `bytes` a floor. */
  complete: boolean;
}

/**
 * How much disk the safe-mode worktree roots are holding.
 *
 * Measured natively and on request only. A worktree is a whole checkout, so
 * walking one from here would be tens of thousands of IPC round trips — and a
 * figure this expensive has no business being recomputed on every render.
 */
export function workspacesDiskUsage(worktrees: string[]): Promise<DiskUsage> {
  return invoke("workspaces_disk_usage", { worktrees });
}
