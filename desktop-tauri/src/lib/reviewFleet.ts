import type { ActivityState } from "./activity";
import type { WorktreeStatus } from "../ipc/review";
import type { PaneState } from "../state/terminalStoreTypes";
import { type ReviewSummary, prTitle, reviewablePanes, summarize } from "./reviewPolicy.ts";

// The row model behind the Review dock's Fleet level, kept out of the
// component the way `reviewPolicy` keeps the per-changeset decisions out of
// it. Fleet answers one question across every safe-mode workspace at once —
// which agents are done — and the answer is a sort, not a scan.
//
// Plain data in, plain data out: panes, a status map, an activity map, an
// orphan list. No store reaches in here, which is what lets the whole sort be
// pinned by a test.

/**
 * A row's state, written in the order it sorts.
 *
 * `working` and `attention` mirror the pane's `ActivityState` deliberately,
 * so the dock and the terminal grid agree at a glance — the grid already
 * paints `adot--working` / `adot--attention` off the same value. `ready` and
 * `orphaned` are the two the grid has no word for.
 */
export type FleetStatus = "ready" | "working" | "attention" | "idle" | "orphaned";

/** A `vibyra/*` worktree on disk that no live pane owns. */
export interface OrphanWorkspace {
  path: string;
  branch: string;
  /** Remembered from the pane that made it, where the session still knows. */
  agentId?: string | null;
  title?: string | null;
  status?: WorktreeStatus | null;
  changedAt?: number;
}

export interface FleetRow {
  /** Stable list key: the pane id, or the worktree path for an orphan. */
  key: string;
  /** Null for an orphan — there is no terminal left to send the user to. */
  paneId: number | null;
  /** The `vibyra/` prefix stripped; it is noise when every row wears it. */
  branch: string;
  agentId: string | null;
  title: string;
  summary: ReviewSummary;
  status: FleetStatus;
  /** No status has been fetched yet, so the tally is unknown, not zero. */
  stale: boolean;
  /** When this workspace last changed; the within-group sort key. */
  changedAt: number;
}

export interface FleetInput {
  panes: PaneState[];
  projectId: string | null;
  /** Keyed by pane id. A missing entry means nothing has been fetched yet. */
  statuses: Record<number, WorktreeStatus | null | undefined>;
  activity: Record<number, ActivityState | undefined>;
  orphans?: OrphanWorkspace[];
  /** Keyed by pane id; the watcher stamps it when a status comes back. */
  changedAt?: Record<number, number | undefined>;
}

export interface FleetTally {
  workspaces: number;
  ready: number;
}

const RANK: Record<FleetStatus, number> = {
  ready: 0,
  attention: 1,
  working: 2,
  idle: 3,
  orphaned: 4,
};

const PREFIX = "vibyra/";

function shortBranch(branch: string): string {
  return branch.startsWith(PREFIX) ? branch.slice(PREFIX.length) : branch;
}

/**
 * `ready` is the state the whole panel exists to surface: the agent stopped
 * and left something behind. It needs both halves — an idle pane with an
 * empty changeset is just an idle pane, and a pane whose status has never
 * come back cannot claim to be ready off a tally it does not have.
 *
 * `attention` outranks it on purpose. A pane sitting on a permission prompt
 * has not finished; sending the user to its diff rather than its terminal
 * would be the wrong move even with a non-empty changeset behind it.
 */
function statusFor(
  activity: ActivityState,
  summary: ReviewSummary,
  stale: boolean,
): FleetStatus {
  if (activity === "attention") return "attention";
  if (activity === "working") return "working";
  return !stale && summary.files > 0 ? "ready" : "idle";
}

function paneRow(pane: PaneState, input: FleetInput): FleetRow {
  const status = input.statuses[pane.id] ?? null;
  const stale = status === null;
  const summary = summarize(status);
  return {
    key: `pane:${pane.id}`,
    paneId: pane.id,
    branch: shortBranch(pane.workspace?.branch ?? ""),
    agentId: pane.agentId,
    // The same name the pull request takes: one display name per pane, not a
    // second ladder of fallbacks that can disagree with the first.
    title: prTitle(pane),
    summary,
    status: statusFor(input.activity[pane.id] ?? "idle", summary, stale),
    stale,
    changedAt: input.changedAt?.[pane.id] ?? 0,
  };
}

/**
 * A pane closed with the X instead of Discard, or the app killed: the
 * worktree and its branch outlive the pane. Today those are invisible and
 * leak forever, so the fleet gives them a row rather than filtering them out
 * for the one thing they lack. Last in the sort — they are housekeeping, not
 * work in flight.
 */
function orphanRow(orphan: OrphanWorkspace): FleetRow {
  const status = orphan.status ?? null;
  const branch = shortBranch(orphan.branch);
  return {
    key: `worktree:${orphan.path}`,
    paneId: null,
    branch,
    agentId: orphan.agentId ?? null,
    title: orphan.title || branch,
    summary: summarize(status),
    status: "orphaned",
    stale: status === null,
    changedAt: orphan.changedAt ?? 0,
  };
}

/**
 * Ready first, then the panes still busy, then the quiet ones, then the
 * leftovers. Within a group, most recently changed first.
 *
 * The last two tie-breaks are not decoration. This list re-sorts under a live
 * watcher, and two rows comparing equal would be free to swap places on every
 * refresh — reshuffling under the user's cursor between aim and click. Pane
 * id, then key, makes the order total.
 */
function compareRows(a: FleetRow, b: FleetRow): number {
  if (RANK[a.status] !== RANK[b.status]) return RANK[a.status] - RANK[b.status];
  if (a.changedAt !== b.changedAt) return b.changedAt - a.changedAt;
  const left = a.paneId ?? Number.MAX_SAFE_INTEGER;
  const right = b.paneId ?? Number.MAX_SAFE_INTEGER;
  if (left !== right) return left - right;
  return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
}

export function fleetRows(input: FleetInput): FleetRow[] {
  const rows = reviewablePanes(input.panes, input.projectId).map((pane) =>
    paneRow(pane, input),
  );
  for (const orphan of input.orphans ?? []) rows.push(orphanRow(orphan));
  return rows.sort(compareRows);
}

/** The Fleet header's first two facts, and the dock tab's badge count. */
export function fleetTally(rows: FleetRow[]): FleetTally {
  return {
    workspaces: rows.length,
    ready: rows.reduce((count, row) => count + (row.status === "ready" ? 1 : 0), 0),
  };
}
