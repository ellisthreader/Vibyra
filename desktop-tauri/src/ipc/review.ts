import { invoke } from "@tauri-apps/api/core";

import type { SafeWorkspaceRef } from "../types";

export type ChangeKind = "added" | "modified" | "deleted" | "renamed";

export interface ChangedFile {
  path: string;
  kind: ChangeKind;
  additions: number;
  deletions: number;
}

export interface WorktreeStatus {
  changed: ChangedFile[];
  /** True when the list was cut at the native ceiling. */
  truncated: boolean;
}

export interface MergeOutcome {
  applied: boolean;
  /** Files that stopped the merge; non-empty means nothing was changed. */
  conflicts: string[];
}

export function reviewStatus(workspace: SafeWorkspaceRef): Promise<WorktreeStatus> {
  return invoke("review_status", {
    worktree: workspace.path,
    baseCommit: workspace.baseCommit,
  });
}

export function reviewFileDiff(workspace: SafeWorkspaceRef, path: string): Promise<string> {
  return invoke("review_file_diff", {
    worktree: workspace.path,
    baseCommit: workspace.baseCommit,
    path,
  });
}

export function reviewMerge(
  projectRoot: string,
  workspace: SafeWorkspaceRef,
): Promise<MergeOutcome> {
  return invoke("review_merge", {
    projectRoot,
    worktree: workspace.path,
    baseCommit: workspace.baseCommit,
  });
}

export function reviewRejectFile(workspace: SafeWorkspaceRef, path: string): Promise<void> {
  return invoke("review_reject_file", {
    worktree: workspace.path,
    baseCommit: workspace.baseCommit,
    path,
  });
}

export function reviewDiscard(projectRoot: string, workspace: SafeWorkspaceRef): Promise<void> {
  return invoke("review_discard", { projectRoot, worktree: workspace.path });
}
