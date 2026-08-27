import type { ActivityState } from "./activity";
import type { ChangedFile, WorktreeStatus } from "../ipc/review";
import type { PaneState } from "../state/terminalStoreTypes";

// Pure decisions for the Review dock tool, kept out of the components the way
// `updateCheckPolicy` and `notificationPolicy` are. A review exists for panes
// that ran in a safe-mode worktree — nothing else has an isolated changeset.

/** The panes this project can review, in grid order. */
export function reviewablePanes(panes: PaneState[], projectId: string | null): PaneState[] {
  return panes.filter((pane) => pane.projectId === projectId && pane.workspace !== null);
}

export interface ReviewSummary {
  files: number;
  additions: number;
  deletions: number;
}

export function summarize(status: WorktreeStatus | null): ReviewSummary {
  const changed = status?.changed ?? [];
  return {
    files: changed.length,
    additions: changed.reduce((sum, file) => sum + file.additions, 0),
    deletions: changed.reduce((sum, file) => sum + file.deletions, 0),
  };
}

/**
 * Merging mid-answer takes a moving snapshot: whatever the agent writes after
 * the patch is cut stays behind in the worktree. Worth a pause, not a block.
 */
export function mergeWarning(activity: ActivityState): string | null {
  if (activity !== "working") return null;
  return "The agent is still working — changes it makes after this approval stay in the safe workspace.";
}

/** The PR inherits the pane's name — the conversation already titled itself. */
export function prTitle(pane: PaneState): string {
  return pane.customTitle || pane.chatTitle || pane.title;
}

/** A body the reviewer can scan: the manifest, then where it came from. */
export function prBody(status: WorktreeStatus | null, branch: string): string {
  const summary = summarize(status);
  const lines = (status?.changed ?? []).slice(0, 50).map(describeFile);
  const overflow = summary.files > 50 ? [`… and ${summary.files - 50} more files`] : [];
  return [
    `${summary.files} files changed (+${summary.additions} −${summary.deletions}).`,
    "",
    ...lines,
    ...overflow,
    "",
    `Opened from a Vibyra safe workspace (\`${branch}\`).`,
  ].join("\n");
}

function describeFile(file: ChangedFile): string {
  const mark = { added: "A", modified: "M", deleted: "D", renamed: "R" }[file.kind];
  return `- \`${mark}\` ${file.path} (+${file.additions} −${file.deletions})`;
}
