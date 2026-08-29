import type { GithubStatus } from "../ipc/github";
import type { MergeOutcome, WorktreeEntry, WorktreeStatus } from "../ipc/review";
import type { LineRange } from "../lib/reviewCollisions";
import type { FileSelection } from "../lib/reviewSelection";
import type { PaneState } from "./terminalStoreTypes";

/**
 * The Review dock has two levels and no third.
 *
 * `fleet` answers "who is done?" across every safe-mode workspace; `changeset`
 * reads one of them. A file's diff expands inside `changeset`, so opening a
 * diff is never a navigation — which is what keeps Back meaning one thing.
 */
export type ReviewLevel = "fleet" | "changeset";

export interface ReviewStore {
  level: ReviewLevel;
  /** The pane `changeset` is reading, or null to follow the focused pane. */
  selectedPane: number | null;
  statusByPane: Record<number, WorktreeStatus>;
  /** The last land's result per pane, kept until the next action replaces it. */
  outcomeByPane: Record<number, MergeOutcome>;
  /** Contested paths only — see `reviewFleetActions.contestedPaths`. */
  rangesByPane: Record<number, Record<string, LineRange[]>>;
  /** Per pane, the files a land would take. `undefined` means all of them. */
  selectionByPane: Record<number, FileSelection>;
  /**
   * Panes whose changes are already in the project. The radar grades an
   * overlap against one of these as `conflict` rather than a warning: the
   * other workspace's patch will now fail against what is in the checkout.
   */
  landed: number[];
  /** When each pane's status last came back; the fleet's within-group sort. */
  changedAt: Record<number, number>;
  /** Every `vibyra/*` worktree on disk, so orphans become reachable. */
  orphans: WorktreeEntry[];
  loadingPane: number | null;
  /** Land, discard and PR are single-flight, like relaunch operations. */
  busyPane: number | null;
  refreshingAll: boolean;
  github: GithubStatus | null;

  select: (paneId: number | null) => void;
  openFleet: () => void;
  refresh: (pane: PaneState) => Promise<void>;
  refreshAll: (panes: PaneState[]) => Promise<void>;
  refreshOrphans: (projectRoot: string) => Promise<void>;
  refreshGithub: (projectRoot: string) => Promise<void>;
  merge: (pane: PaneState, projectRoot: string) => Promise<void>;
  discard: (pane: PaneState, projectRoot: string) => Promise<void>;
  /** Land only the ticked files, leaving the rest in the workspace. */
  toggleFile: (paneId: number, path: string) => void;
  setSelection: (paneId: number, selection: FileSelection) => void;
  /** The pane-header chip's action: open the dock on this pane's changeset. */
  openForPane: (paneId: number) => void;
}
