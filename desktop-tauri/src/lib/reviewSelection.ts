import type { WorktreeStatus } from "../ipc/review";

// Which files a partial land will take.
//
// The stored selection is deliberately `undefined` rather than a full list
// while everything is ticked. A changeset grows under a working agent, and a
// list captured when the panel opened would quietly stop covering the files
// that arrived after — "everything" has to keep meaning everything.

/** No stored selection means every file, including ones not yet listed. */
export type FileSelection = string[] | undefined;

export function allPaths(status: WorktreeStatus | null): string[] {
  return (status?.changed ?? []).map((file) => file.path);
}

/** The paths a land would actually send, in changeset order. */
export function selectedPaths(status: WorktreeStatus | null, selection: FileSelection): string[] {
  const paths = allPaths(status);
  if (selection === undefined) return paths;
  const picked = new Set(selection);
  return paths.filter((path) => picked.has(path));
}

export function isSelected(selection: FileSelection, path: string): boolean {
  return selection === undefined || selection.includes(path);
}

/**
 * Ticking the last unticked file returns to `undefined`, not to a list that
 * happens to hold every current path — so a file the agent writes next stays
 * included, which is what the checkbox appeared to promise.
 */
export function toggleSelection(
  status: WorktreeStatus | null,
  selection: FileSelection,
  path: string,
): FileSelection {
  const paths = allPaths(status);
  const current = selection === undefined ? paths : paths.filter((p) => selection.includes(p));
  const next = current.includes(path)
    ? current.filter((p) => p !== path)
    : paths.filter((p) => current.includes(p) || p === path);
  return next.length === paths.length ? undefined : next;
}

/**
 * How the action bar counts, and whether a land is even offered. An empty
 * selection is a valid state to sit in — it is just not one you can land from.
 */
export function selectionCount(status: WorktreeStatus | null, selection: FileSelection): number {
  return selectedPaths(status, selection).length;
}

/** True when nothing has been unticked, which is the state the bar defaults to. */
export function isEverything(selection: FileSelection): boolean {
  return selection === undefined;
}
