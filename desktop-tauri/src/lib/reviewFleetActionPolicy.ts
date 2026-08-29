import type { Collision } from "./reviewCollisions";
import type { FleetRow } from "./reviewFleet.ts";

// What the Fleet level is allowed to offer, and what a "land all" run adds up
// to. Pure, and kept out of the components for the same reason `reviewPolicy`
// and `reviewCollisions` are: the rule that an unresolved overlap loses its
// one-click Land is the entire argument for the radar existing, and a rule
// that lives inside JSX is a rule nothing can pin.

/**
 * A collision the user has to deal with before landing.
 *
 * `touch` never qualifies. Two agents editing different functions in one file
 * is the normal shape of parallel work — see the note in `reviewCollisions` —
 * and treating it as an obstacle would make the safe case feel unsafe.
 */
function blocking(collision: Collision): boolean {
  return collision.level !== "touch";
}

/** The rows the radar shows: overlaps and conflicts, never bare touches. */
export function radarCollisions(found: Collision[]): Collision[] {
  return found.filter(blocking);
}

function keysOf(found: Collision[]): Set<string> {
  const keys = new Set<string>();
  for (const collision of found) {
    for (const party of collision.workspaces) keys.add(party.key);
  }
  return keys;
}

/**
 * Every workspace sharing a path with another, at any severity.
 *
 * This is the quiet pip on the row and nothing more — it says "someone else is
 * in here too", which is worth knowing and is not worth an alarm.
 */
export function contestedKeys(found: Collision[]): Set<string> {
  return keysOf(found);
}

/** Workspaces party to an overlap or worse. These lose their inline Land. */
export function blockedKeys(found: Collision[]): Set<string> {
  return keysOf(radarCollisions(found));
}

/**
 * Rows a land can act on at all: finished, and with a terminal behind them.
 *
 * An orphan is excluded on purpose. Its worktree is real and its changes are
 * real, but the pane that owned it is gone, so there is nothing to hand the
 * result back to — an orphan is housekeeping, not work waiting to land.
 */
export function landableRows(rows: FleetRow[]): FleetRow[] {
  return rows.filter((row) => row.status === "ready" && row.paneId !== null);
}

/**
 * Whether this row gets the one-click Land beside it.
 *
 * A ready row with an unresolved overlap deliberately does not. The land would
 * very likely fail, and offering it anyway would teach the user that the radar
 * above it is decoration.
 */
export function canLandInline(row: FleetRow, blocked: boolean): boolean {
  return row.status === "ready" && row.paneId !== null && !blocked;
}

export interface LandAttempt {
  key: string;
  paneId: number;
  /** How the row named itself, so a failure can be linked back to it. */
  label: string;
  applied: boolean;
}

export interface LandReport {
  landed: number;
  stuck: LandAttempt[];
  text: string;
}

function needing(count: number): string {
  return count === 1 ? "1 needs attention" : `${count} need attention`;
}

/**
 * What an "approve everything" run is allowed to claim afterwards.
 *
 * Never "approved everything": the run is a sequence of independent
 * all-or-nothing merges, some of which are expected to bounce off a checkout
 * the earlier ones just moved. Saying exactly how many bounced, and leaving
 * them linked to their changesets, is the honest report.
 */
export function landReport(attempts: LandAttempt[]): LandReport {
  const stuck = attempts.filter((attempt) => !attempt.applied);
  const landed = attempts.length - stuck.length;
  if (landed === 0) return { landed, stuck, text: `Nothing went in · ${needing(stuck.length)}` };
  if (stuck.length === 0) return { landed, stuck, text: `Approved ${landed}` };
  return { landed, stuck, text: `Approved ${landed} · ${needing(stuck.length)}` };
}
