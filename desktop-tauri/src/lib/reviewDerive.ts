import type { ActivityState } from "./activity";
import type { WorktreeEntry, WorktreeStatus } from "../ipc/review";
import type { PaneState } from "../state/terminalStoreTypes";
import {
  collisions,
  type Collision,
  type CollisionWorkspace,
  type LineRange,
} from "./reviewCollisions.ts";
import { fleetRows, type FleetRow, type OrphanWorkspace } from "./reviewFleet.ts";

// One derivation, two callers. The fleet panel draws these rows and the
// watcher decides what to announce from them, and if each built its own the
// two could disagree about who is ready — which is the one thing a badge and
// the list behind it must never do.

export interface ReviewSlice {
  panes: PaneState[];
  projectId: string | null;
  statuses: Record<number, WorktreeStatus | undefined>;
  activity: Record<number, ActivityState | undefined>;
  changedAt: Record<number, number | undefined>;
  ranges: Record<number, Record<string, LineRange[]> | undefined>;
  orphans: WorktreeEntry[];
  landed: number[];
}

export interface DerivedFleet {
  rows: FleetRow[];
  found: Collision[];
}

/** A row names itself the way the pane header does, so the two are one thing. */
export function rowLabel(row: FleetRow): string {
  return row.paneId === null ? row.branch : `${row.title} #${row.paneId}`;
}

/**
 * Worktrees git knows about that no live pane owns.
 *
 * A pane closed with its X rather than through Discard leaves its worktree
 * behind, and until it appears here nothing in the app can reach it again.
 */
function orphansOf(entries: WorktreeEntry[], panes: PaneState[]): OrphanWorkspace[] {
  const owned = new Set(panes.map((pane) => pane.workspace?.path).filter(Boolean));
  return entries
    .filter((entry) => !owned.has(entry.path))
    .map((entry) => ({ path: entry.path, branch: entry.branch }));
}

function collisionInput(rows: FleetRow[], slice: ReviewSlice): CollisionWorkspace[] {
  const parties: CollisionWorkspace[] = [];
  for (const row of rows) {
    if (row.paneId === null) continue;
    const status = slice.statuses[row.paneId];
    if (!status) continue;
    const ranges = slice.ranges[row.paneId] ?? {};
    parties.push({
      key: row.key,
      paneId: row.paneId,
      label: rowLabel(row),
      landed: slice.landed.includes(row.paneId),
      files: status.changed.map((file) => ({
        path: file.path,
        kind: file.kind,
        // Absent for anything uncontested — only shared paths are ever read,
        // and a missing range is reported as `touch`, never guessed at.
        ranges: ranges[file.path],
      })),
    });
  }
  return parties;
}

export function deriveFleet(slice: ReviewSlice): DerivedFleet {
  const rows = fleetRows({
    panes: slice.panes,
    projectId: slice.projectId,
    statuses: slice.statuses,
    activity: slice.activity,
    changedAt: slice.changedAt,
    orphans: orphansOf(slice.orphans, slice.panes),
  });
  return { rows, found: collisions(collisionInput(rows, slice)) };
}
