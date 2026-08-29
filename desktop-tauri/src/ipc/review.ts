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

/**
 * Lands the workspace's changes in the project as ordinary working-tree edits.
 *
 * `paths` narrows that to a selection — the same repo-root-relative strings
 * `reviewStatus` returns. Omitting it means everything, which is what the
 * whole-workspace actions send; the native side treats an absent list and an
 * empty one alike. All-or-nothing holds over whatever was selected.
 */
export function reviewMerge(
  projectRoot: string,
  workspace: SafeWorkspaceRef,
  paths?: string[],
): Promise<MergeOutcome> {
  return invoke("review_merge", {
    projectRoot,
    worktree: workspace.path,
    baseCommit: workspace.baseCommit,
    paths,
  });
}

export function reviewDiscard(projectRoot: string, workspace: SafeWorkspaceRef): Promise<void> {
  return invoke("review_discard", { projectRoot, worktree: workspace.path });
}

/** A `vibyra/*` worktree on disk, whether or not a pane still owns it. */
export interface WorktreeEntry {
  path: string;
  branch: string;
  head: string;
  locked: boolean;
  /** False once the folder is gone but git has not pruned the record yet. */
  exists: boolean;
}

export interface PruneOutcome {
  prunedWorktrees: number;
  deletedBranches: string[];
  sweptFiles: number;
}

/**
 * Every safe-mode worktree this project has, so the fleet can show the ones
 * no pane owns. Closing a pane with its X — rather than through Discard —
 * leaves the worktree behind, and until it is listed here it is invisible.
 */
export function reviewListWorktrees(projectRoot: string): Promise<WorktreeEntry[]> {
  return invoke("review_list_worktrees", { projectRoot });
}

/** Reaps worktrees git has lost, their merged branches, and scratch files. */
export function reviewPruneWorktrees(projectRoot: string): Promise<PruneOutcome> {
  return invoke("review_prune_worktrees", { projectRoot });
}
