import { reviewDiscard, reviewListWorktrees, type PruneOutcome } from "../../ipc/review";
import { useProjectStore } from "../../state/projectStore";
import { useReviewStore } from "../../state/reviewStore";
import type { PaneState } from "../../state/terminalStoreTypes";
import { useWorkspaceStore } from "../../state/workspaceStore";
import type { ProjectSpec } from "../../types";

// The model behind Settings ▸ Safe workspaces.
//
// Safe mode creates a worktree and a branch per pane, and until this pane
// existed nothing ever listed them: closing a pane with its X — rather than
// through the review dock's Discard — left both behind forever. The Review
// dock only ever knew about the worktrees its own panes own, so a leaked one
// was invisible from inside the app.

export interface SafeWorkspaceRow {
  path: string;
  branch: string;
  project: ProjectSpec;
  /** The pane that still owns this worktree, when one does. */
  pane: PaneState | null;
  /** False once the folder is gone but git still holds the registration. */
  exists: boolean;
}

/**
 * Every `vibyra/*` worktree across every known project, paired with its pane.
 *
 * One `git worktree list` per project, in sequence: the project count is a
 * single digit and each call is already off-thread natively, so fanning out
 * would buy nothing but a burst of git processes. A project that will not
 * read is skipped rather than failing the whole scan — a repo that moved must
 * not hide the leaks in the ones that did not.
 */
export async function scanWorkspaces(
  projects: ProjectSpec[],
  panes: PaneState[],
): Promise<SafeWorkspaceRow[]> {
  const rows: SafeWorkspaceRow[] = [];
  for (const project of projects) {
    let entries;
    try {
      entries = await reviewListWorktrees(project.root);
    } catch {
      continue;
    }
    for (const entry of entries) {
      rows.push({
        path: entry.path,
        branch: entry.branch,
        project,
        pane: panes.find((pane) => pane.workspace?.path === entry.path) ?? null,
        exists: entry.exists,
      });
    }
  }
  return rows;
}

/** What the sweep actually did, as one sentence rather than three counters. */
export function pruneSummary(outcome: PruneOutcome): string {
  const parts = [
    `${outcome.prunedWorktrees} workspace ${outcome.prunedWorktrees === 1 ? "record" : "records"}`,
    `${outcome.deletedBranches.length} merged ${outcome.deletedBranches.length === 1 ? "branch" : "branches"}`,
    `${outcome.sweptFiles} stray ${outcome.sweptFiles === 1 ? "file" : "files"}`,
  ];
  return `Removed ${parts.join(", ")}.`;
}

/**
 * Takes the user to this workspace in the Review dock, switching project
 * first when the row belongs to a different one — a review that opened on the
 * wrong project would show the fleet of somewhere else entirely.
 */
export async function openReview(row: SafeWorkspaceRow): Promise<void> {
  const workspace = useWorkspaceStore.getState();
  workspace.closeSettings();
  if (useProjectStore.getState().activeId !== row.project.id) {
    await useProjectStore.getState().activate(row.project.id);
  }
  if (row.pane) {
    useReviewStore.getState().openForPane(row.pane.id);
    return;
  }
  // An orphan has no pane to open a changeset on, so the fleet — which lists
  // orphans — is the only honest destination.
  useReviewStore.getState().select(null);
  workspace.setDockTool("review");
}

/**
 * Deletes the worktree and its branch.
 *
 * A pane still owning the workspace goes through the review store, which
 * closes that pane in the same operation; nothing else can, and leaving a
 * pane pointed at a deleted folder would be worse than the leak.
 */
export async function discardWorkspace(row: SafeWorkspaceRow): Promise<void> {
  if (row.pane) {
    await useReviewStore.getState().discard(row.pane, row.project.root);
    return;
  }
  // `baseCommit` is only ever used to diff a workspace; discarding reads the
  // path and the branch on it, so an orphan has everything the call needs.
  await reviewDiscard(row.project.root, { path: row.path, branch: row.branch, baseCommit: "" });
}
