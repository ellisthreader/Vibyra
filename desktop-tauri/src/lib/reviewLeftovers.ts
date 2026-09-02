import type { FleetRow } from "./reviewFleet.ts";

// Telling work in flight apart from litter.
//
// Every safe-mode pane leaves a worktree behind unless it is landed or
// discarded, and closing a pane with its X does neither. On a machine that has
// been running agents for a few weeks that is dozens of them — this one had
// forty against three live agents — and the fleet listed all of them inline,
// in the same row shape as real work, each saying "Terminal closed — work
// saved" over a branch name and nothing else.
//
// Three things were wrong with that. The list stopped answering "who is done",
// because the answer was four rows down a wall of housekeeping. The rows were
// inert — no changeset to open and no action on them — so the only thing they
// could do was take up space. And "work saved" asserts something the fleet
// never checked: an orphan's changeset is never read, so a leftover holding
// nothing at all made the same claim as one holding a day's work.
//
// So they are split out here, counted, and folded behind one line.

export interface FleetSplit {
  /** Rows with a terminal behind them — what the panel is actually for. */
  live: FleetRow[];
  /** Worktrees no pane owns. Housekeeping, not work in flight. */
  leftovers: FleetRow[];
}

export function splitFleet(rows: FleetRow[]): FleetSplit {
  const live: FleetRow[] = [];
  const leftovers: FleetRow[] = [];
  for (const row of rows) (row.paneId === null ? leftovers : live).push(row);
  return { live, leftovers };
}

/**
 * The one line the group collapses to.
 *
 * "Copy" rather than "worktree" for the same reason the rows say "Still
 * working…" rather than a git word: the header a line above already promises
 * "its own safe copy of your project", and this is what is left of one.
 */
export function leftoverSummary(count: number): string {
  return count === 1 ? "1 leftover copy" : `${count} leftover copies`;
}
