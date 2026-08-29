import type { ChangeKind } from "../ipc/review";

// The collision radar: which workspaces are about to fight over the same file,
// answered while the agents are still running rather than at merge time.
// Isolation is table stakes; this is the part after it.
//
// Range-based and pure on purpose. The line ranges arrive as input — the
// caller parses the diffs, this module only compares them — so the radar can
// be pinned by a test, and so it can say "I don't know" honestly when a diff
// has not been parsed yet.

export type CollisionLevel = "touch" | "overlap" | "conflict";

export interface LineRange {
  /** 1-based and inclusive, on the workspace's own side of the diff. */
  start: number;
  end: number;
}

export interface CollisionFile {
  path: string;
  kind: ChangeKind;
  /** Changed line ranges. Absent means "not parsed yet", never "none". */
  ranges?: LineRange[];
}

export interface CollisionWorkspace {
  /** Stable identity, shared with the fleet row so a radar row can link. */
  key: string;
  paneId: number | null;
  /** How a row names it: `claude #3`. */
  label: string;
  files: CollisionFile[];
  /** Already merged into the checkout, so everyone else now patches onto it. */
  landed?: boolean;
}

export interface CollisionParty {
  key: string;
  paneId: number | null;
  label: string;
  landed: boolean;
}

export interface Collision {
  path: string;
  level: CollisionLevel;
  /** Every workspace on the path, not just the pair that scored the worst. */
  workspaces: CollisionParty[];
}

interface Entry {
  workspace: CollisionWorkspace;
  file: CollisionFile;
}

/**
 * Ranges this close are effectively one range. A unified diff carries three
 * lines of context either side, so two hunks with less than that between them
 * share context lines and cannot be applied independently — treating them as
 * separate would promise an isolation git will not deliver.
 */
const CONTEXT_GUTTER = 3;

const RANK: Record<CollisionLevel, number> = { conflict: 0, overlap: 1, touch: 2 };

function near(a: LineRange, b: LineRange): boolean {
  return a.start - CONTEXT_GUTTER <= b.end && b.start - CONTEXT_GUTTER <= a.end;
}

function intersects(left: LineRange[], right: LineRange[]): boolean {
  return left.some((a) => right.some((b) => near(a, b)));
}

/**
 * The rule the whole feature stands on: two agents editing different
 * functions in one file is *normal*, and reporting that as a problem is how a
 * radar turns into noise the user learns to scroll past. Sharing a path alone
 * is `touch` — dim, informational, no notification. Only ranges that actually
 * meet earn `overlap`.
 */
function pairLevel(a: Entry, b: Entry): CollisionLevel {
  const landed = a.workspace.landed === true || b.workspace.landed === true;
  // A deletion cannot be reconciled with any other change to the same file:
  // whatever the other workspace wrote has nowhere left to go, and a patch
  // against a file that is no longer there fails outright.
  if (a.file.kind === "deleted" || b.file.kind === "deleted") {
    return landed ? "conflict" : "overlap";
  }
  // Missing ranges mean the diff has not been parsed yet. Report the weakest
  // thing that is true rather than a collision we cannot substantiate.
  if (!a.file.ranges || !b.file.ranges) return "touch";
  if (!intersects(a.file.ranges, b.file.ranges)) return "touch";
  // An overlap where one side has already landed is no longer a warning: the
  // other's patch will now fail against what is in the checkout.
  return landed ? "conflict" : "overlap";
}

function levelFor(entries: Entry[]): CollisionLevel {
  let level: CollisionLevel = "touch";
  for (let i = 0; i < entries.length; i += 1) {
    for (let j = i + 1; j < entries.length; j += 1) {
      const pair = pairLevel(entries[i], entries[j]);
      if (RANK[pair] < RANK[level]) level = pair;
    }
  }
  return level;
}

function compareParties(a: CollisionParty, b: CollisionParty): number {
  const left = a.paneId ?? Number.MAX_SAFE_INTEGER;
  const right = b.paneId ?? Number.MAX_SAFE_INTEGER;
  if (left !== right) return left - right;
  return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
}

function parties(entries: Entry[]): CollisionParty[] {
  return entries
    .map(({ workspace }) => ({
      key: workspace.key,
      paneId: workspace.paneId,
      label: workspace.label,
      landed: workspace.landed === true,
    }))
    .sort(compareParties);
}

/**
 * Worst first, then by path. The radar refreshes on every status that comes
 * back, so the order has to be a function of the data alone — a list that
 * reorders because a `Map` was walked differently is a list nobody can click.
 */
function compareCollisions(a: Collision, b: Collision): number {
  if (RANK[a.level] !== RANK[b.level]) return RANK[a.level] - RANK[b.level];
  return a.path < b.path ? -1 : a.path > b.path ? 1 : 0;
}

export function collisions(workspaces: CollisionWorkspace[]): Collision[] {
  const byPath = new Map<string, Entry[]>();
  for (const workspace of workspaces) {
    for (const file of workspace.files) {
      const entries = byPath.get(file.path) ?? [];
      entries.push({ workspace, file });
      byPath.set(file.path, entries);
    }
  }
  const found: Collision[] = [];
  for (const [path, entries] of byPath) {
    // One workspace on a path is not a collision, it is just work.
    if (entries.length < 2) continue;
    found.push({ path, level: levelFor(entries), workspaces: parties(entries) });
  }
  return found.sort(compareCollisions);
}

const HUNK_HEADER = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/;

/**
 * Line ranges straight off a unified diff's hunk headers, so a caller has
 * something to feed the radar with today. Deliberately not a diff parser:
 * `@@ -a,b +c,d @@` is the entire contract, and reading only the headers
 * keeps a 512 KiB diff cheap enough to run on every status refresh.
 */
export function rangesFromDiff(diff: string): LineRange[] {
  const ranges: LineRange[] = [];
  for (const line of diff.split("\n")) {
    const match = HUNK_HEADER.exec(line);
    if (!match) continue;
    const start = Number(match[1]);
    if (!Number.isFinite(start)) continue;
    const count = match[2] === undefined ? 1 : Number(match[2]);
    // A `+c,0` hunk removes lines without adding any. It still occupies the
    // seam at `c`, so it gets a one-line range instead of being dropped.
    ranges.push({ start, end: start + Math.max(count, 1) - 1 });
  }
  return ranges;
}
