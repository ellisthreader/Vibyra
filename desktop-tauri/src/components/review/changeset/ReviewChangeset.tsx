import { useEffect } from "react";

import { isSelected } from "../../../lib/reviewSelection";
import { useReviewStore } from "../../../state/reviewStore";
import type { PaneState } from "../../../state/terminalStoreTypes";
import { ReviewActions } from "../ReviewActions";
import { ReviewFileRow } from "../ReviewFileRow";
import { ReviewChangesetHead } from "./ReviewChangesetHead";
import { ReviewOverlapBanner } from "./ReviewOverlapBanner";
import { ReviewSelectionBar } from "./ReviewSelectionBar";
import { useChangesetOverlaps } from "./useChangesetOverlaps";

// One workspace, read end to end: what it changed, what of that you are taking,
// and how the review ends.
//
// The level owns its own refresh rather than inheriting a status from the
// fleet. A changeset is what you are looking at *now*, and a list assembled
// when the fleet was drawn goes stale in the seconds it takes to read one file.
//
// Nothing here is a second scroll region: the head, the tally and the action
// bar are fixed, the file list scrolls, and a diff opens inside it. That is the
// dock's one-column rule, and it is what keeps Back meaning one thing.

interface Props {
  pane: PaneState;
  root: string;
}

export function ReviewChangeset({ pane, root }: Props) {
  const status = useReviewStore((state) => state.statusByPane[pane.id] ?? null);
  const selection = useReviewStore((state) => state.selectionByPane[pane.id]);
  const toggleFile = useReviewStore((state) => state.toggleFile);
  const refresh = useReviewStore((state) => state.refresh);
  const overlaps = useChangesetOverlaps(pane);

  useEffect(() => {
    void refresh(pane);
    // Keyed off identity, not the object: panes re-render on every keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pane.id, pane.workspace?.path]);

  return (
    <>
      <ReviewChangesetHead pane={pane} />
      <ReviewSelectionBar paneId={pane.id} status={status} selection={selection} />
      <div className="review-scroll">
        <ReviewOverlapBanner overlaps={overlaps} />
        {status === null ? (
          <p className="review-note">Reading changes…</p>
        ) : status.changed.length === 0 ? (
          <p className="review-note">
            No changes yet. Everything the agent edits in its safe workspace will be listed here.
          </p>
        ) : (
          <div className="review-list" role="list">
            {status.changed.map((file) => (
              <ReviewFileRow
                key={file.path}
                workspace={pane.workspace!}
                file={file}
                // An absent selection means everything, including files the
                // agent writes after this render — see `reviewSelection`.
                selected={isSelected(selection, file.path)}
                onToggle={() => toggleFile(pane.id, file.path)}
                overlap={overlaps.get(file.path)}
              />
            ))}
            {status.truncated && (
              <p className="review-note">
                The list stops at 2,000 files — the rest are still in the workspace.
              </p>
            )}
          </div>
        )}
      </div>
      <ReviewActions pane={pane} projectRoot={root} status={status} />
    </>
  );
}
