import { useEffect } from "react";

import { reviewablePanes } from "../../lib/reviewPolicy";
import { useReviewStore } from "../../state/reviewStore";
import { useTerminalStore } from "../../state/terminalStore";
import { GitBranchIcon } from "../common/Icons";
import { ReviewChangeset } from "./changeset/ReviewChangeset";
import { ReviewFleet } from "./fleet/ReviewFleet";

interface Props {
  projectId: string;
  root: string;
}

/**
 * The Review dock tool: two levels and no third.
 *
 * Fleet answers "who is done?" across every safe-mode workspace; Changeset
 * reads one of them, with each file's diff expanding in place. A diff is
 * therefore never a navigation, which is what keeps Back meaning exactly one
 * thing however deep into a patch you are.
 *
 * This file only routes. Everything it renders owns its own fetching, and the
 * fleet is watched from `useReviewWatch` above the dock — the tab's badge has
 * to be right while this panel is closed.
 */
export function ReviewPanel({ projectId, root }: Props) {
  const panes = useTerminalStore((state) => state.panes);
  const level = useReviewStore((state) => state.level);
  const selectedPane = useReviewStore((state) => state.selectedPane);
  const orphans = useReviewStore((state) => state.orphans);
  const select = useReviewStore((state) => state.select);
  const openFleet = useReviewStore((state) => state.openFleet);

  const reviewable = reviewablePanes(panes, projectId);
  const pane = reviewable.find((candidate) => candidate.id === selectedPane) ?? null;

  // One workspace does not need a list of one. Opening the tool goes straight
  // to the only changeset there is; the fleet earns its place from two up.
  useEffect(() => {
    if (level === "changeset" || reviewable.length !== 1 || orphans.length > 0) return;
    select(reviewable[0].id);
  }, [level, reviewable, orphans.length, select]);

  // A workspace can vanish under the panel — discarded here, or its pane
  // closed from the grid. Falling back beats rendering a changeset for a
  // worktree that is no longer on disk.
  useEffect(() => {
    if (level === "changeset" && pane === null) openFleet();
  }, [level, pane, openFleet]);

  if (reviewable.length === 0 && orphans.length === 0) {
    return (
      <div className="companion-panel companion-panel--review">
        <div className="review-empty">
          <GitBranchIcon size={22} />
          <h3>Nothing to review</h3>
          <p>
            Terminals launched with <strong>Safe mode</strong> work in their own copy of the
            project. Their changes show up here for you to review, bring in, or discard.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="companion-panel companion-panel--review">
      {level === "changeset" && pane !== null ? (
        <ReviewChangeset pane={pane} root={root} />
      ) : (
        <ReviewFleet projectId={projectId} root={root} />
      )}
    </div>
  );
}
