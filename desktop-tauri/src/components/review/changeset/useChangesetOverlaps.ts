import { useMemo } from "react";

import type { CollisionLevel } from "../../../lib/reviewCollisions";
import { deriveFleet } from "../../../lib/reviewDerive";
import { useReviewStore } from "../../../state/reviewStore";
import { useTerminalStore } from "../../../state/terminalStore";
import type { PaneState } from "../../../state/terminalStoreTypes";

// The radar, read from inside one workspace: which of *these* files another
// live workspace is also holding.
//
// Derived rather than stored, and derived through the same `deriveFleet` the
// fleet list and the notifications use. A second grading rule here could put a
// pip on a row the fleet calls quiet, and a user who sees the two disagree
// stops believing either.

export interface Overlap {
  level: CollisionLevel;
  /** The other workspaces on this path, named as the fleet names them. */
  others: string[];
}

/** Path → overlap, for the files this pane shares with someone else. */
export function useChangesetOverlaps(pane: PaneState): Map<string, Overlap> {
  const panes = useTerminalStore((state) => state.panes);
  const activity = useTerminalStore((state) => state.activity);
  const statuses = useReviewStore((state) => state.statusByPane);
  const changedAt = useReviewStore((state) => state.changedAt);
  const ranges = useReviewStore((state) => state.rangesByPane);
  const orphans = useReviewStore((state) => state.orphans);
  const landed = useReviewStore((state) => state.landed);

  return useMemo(() => {
    const { found } = deriveFleet({
      panes,
      projectId: pane.projectId,
      statuses,
      activity,
      changedAt,
      ranges,
      orphans,
      landed,
    });
    const mine = new Map<string, Overlap>();
    for (const collision of found) {
      const others = collision.workspaces.filter((party) => party.paneId !== pane.id);
      // A collision this pane is not part of belongs to the fleet screen; a
      // row here only ever answers "who else has *my* file".
      if (others.length === collision.workspaces.length) continue;
      mine.set(collision.path, {
        level: collision.level,
        others: others.map((party) => party.label),
      });
    }
    return mine;
  }, [panes, pane.projectId, pane.id, statuses, activity, changedAt, ranges, orphans, landed]);
}
