import { useCallback, useEffect } from "react";

import {
  blockedKeys,
  contestedKeys,
  radarCollisions,
} from "../../../lib/reviewFleetActionPolicy";
import { splitFleet } from "../../../lib/reviewLeftovers";
import { reviewablePanes } from "../../../lib/reviewPolicy";
import { useReviewStore } from "../../../state/reviewStore";
import { useTerminalStore } from "../../../state/terminalStore";
import { ReviewFleetFooter } from "./ReviewFleetFooter";
import { ReviewFleetHeader } from "./ReviewFleetHeader";
import { ReviewFleetRow } from "./ReviewFleetRow";
import { ReviewLeftovers } from "./ReviewLeftovers";
import { ReviewRadar } from "./ReviewRadar";
import { useFleet } from "./useFleet";

interface Props {
  projectId: string;
  root: string;
}

/**
 * The Fleet level: every safe-mode workspace at once, answering one question.
 *
 * Who is done. That is the whole brief, and it is why this is a list with one
 * alarm rather than a dashboard — three facts on top, the radar only when
 * something is actually contested, then the rows. Nothing here is saturated
 * except the radar and the primary Land, because everything that is always
 * loud is something the eye learns to skip.
 *
 * `useReviewWatch` runs above the dock and keeps the fleet current whether or
 * not this panel is open — the tab's badge depends on that. The one manual
 * refresh control is gone (Ellis, 2026-08-29), so opening the panel is now the
 * deliberate edge: one fan-out on mount, then the watcher owns it.
 */
export function ReviewFleet({ projectId, root }: Props) {
  const { rows, found, panes } = useFleet(projectId);
  const refreshAll = useReviewStore((state) => state.refreshAll);
  const refreshOrphans = useReviewStore((state) => state.refreshOrphans);

  // Leftover worktrees are housekeeping, not work in flight, so they do not
  // get to sit between the user and the agent that is waiting on them.
  const { live, leftovers } = splitFleet(rows);

  const radar = radarCollisions(found);
  const blocked = blockedKeys(found);
  const contested = contestedKeys(found);

  // Panes are read at click time rather than closed over. This list re-renders
  // on every activity tick, and a callback that changed with it would hand the
  // header a new prop several times a second for no new behaviour.
  const refresh = useCallback(() => {
    void refreshAll(reviewablePanes(useTerminalStore.getState().panes, projectId));
    void refreshOrphans(root);
  }, [projectId, root, refreshAll, refreshOrphans]);

  useEffect(() => refresh(), [refresh]);

  return (
    <>
      <ReviewFleetHeader />
      <div className="review-scroll fleet-scroll">
        <ReviewRadar collisions={radar} />
        {live.length === 0 && (
          <p className="fleet-none">
            No agent is working in a safe copy right now.
          </p>
        )}
        {live.length > 0 && (
        <div className="fleet-list" role="list" aria-label="Safe workspaces">
          {live.map((row) => (
            <ReviewFleetRow
              key={row.key}
              row={row}
              pane={panes.find((pane) => pane.id === row.paneId) ?? null}
              contested={contested.has(row.key)}
              blocked={blocked.has(row.key)}
              root={root}
            />
          ))}
        </div>
        )}
        <ReviewLeftovers rows={leftovers} root={root} />
      </div>
      <ReviewFleetFooter rows={rows} panes={panes} root={root} />
    </>
  );
}
