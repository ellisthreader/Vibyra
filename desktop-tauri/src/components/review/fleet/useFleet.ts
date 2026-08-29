import { useMemo } from "react";

import { deriveFleet } from "../../../lib/reviewDerive";
import { fleetRows, fleetTally } from "../../../lib/reviewFleet";
import type { DerivedFleet } from "../../../lib/reviewDerive";
import { useProjectStore } from "../../../state/projectStore";
import { useReviewStore } from "../../../state/reviewStore";
import { useTerminalStore } from "../../../state/terminalStore";
import type { PaneState } from "../../../state/terminalStoreTypes";

// The one place the fleet is read out of the stores.
//
// Every selector below returns a field exactly as it is stored — never a
// filtered array, never an object literal. `useSyncExternalStore` compares by
// identity, so a selector that builds a fresh value on each call re-renders
// forever; that is a real loop this codebase has already paid for once (the
// NO_PROJECTS note in `settingsStore`, restated at the top of
// `notificationStore`). The shaping happens in `useMemo` below, after the
// subscription, where a new object is free.

export interface Fleet extends DerivedFleet {
  /** Every pane, so a row can be mapped back to the terminal it came from. */
  panes: PaneState[];
}

export function useFleet(projectId: string): Fleet {
  const panes = useTerminalStore((state) => state.panes);
  const activity = useTerminalStore((state) => state.activity);
  const statuses = useReviewStore((state) => state.statusByPane);
  const changedAt = useReviewStore((state) => state.changedAt);
  const ranges = useReviewStore((state) => state.rangesByPane);
  const orphans = useReviewStore((state) => state.orphans);
  const landed = useReviewStore((state) => state.landed);

  const derived = useMemo(
    () =>
      deriveFleet({ panes, projectId, statuses, activity, changedAt, ranges, orphans, landed }),
    [panes, projectId, statuses, activity, changedAt, ranges, orphans, landed],
  );
  return { ...derived, panes };
}

/**
 * The Review tab's badge: how many workspaces are finished and unread.
 *
 * Deliberately the same `fleetRows` the panel draws from, rather than a
 * second count of its own — a badge that disagrees with the list behind it is
 * worse than no badge. Orphans are left out because an orphan is never
 * `ready`, which saves this hook a subscription the dock tabs do not need.
 */
export function useReadyCount(): number {
  const projectId = useProjectStore((state) => state.activeId);
  const panes = useTerminalStore((state) => state.panes);
  const activity = useTerminalStore((state) => state.activity);
  const statuses = useReviewStore((state) => state.statusByPane);
  const changedAt = useReviewStore((state) => state.changedAt);

  return useMemo(
    () => fleetTally(fleetRows({ panes, projectId, statuses, activity, changedAt })).ready,
    [panes, projectId, statuses, activity, changedAt],
  );
}
