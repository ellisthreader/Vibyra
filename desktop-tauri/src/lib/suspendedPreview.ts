// How much of a saved pane's snapshot the preview terminal actually draws.
//
// A suspended pane is a still picture: nothing can change it until it is
// resumed, and `SuspendedPaneView` scrolls it to the bottom the moment it is
// written. Drawing the whole snapshot therefore parses a quarter-megabyte of
// agent output to show the last screenful — and pays that again on every
// project switch, because the pane grid only renders the active project.
//
// The snapshot itself is never trimmed. `pane.snapshot` is what
// `relaunchContinuity` hands `queueReplay` above a resumed process, and what
// `toPersistedPanes` writes back on quit; trimming it there would erode a
// little scrollback on every restart. This bounds the *drawing* only.

export const PREVIEW_TAIL_CHARS = 64_000;

/**
 * How far into the tail a row break may sit and still be worth skipping to.
 *
 * Bounds the pathological case — a single enormous unbroken row — where the
 * first break could otherwise be most of the way through the tail and snapping
 * to it would throw the preview away to tidy one row.
 */
const MAX_BOUNDARY_SCAN = 2_000;

/** Ends a row: a CRLF pair, or either half of one on its own. */
const ROW_BREAK = /\r\n|\n|\r/;

/**
 * The slice of `snapshot` worth drawing in a suspended pane.
 *
 * Always a suffix of the input, so the preview shows real trailing output and
 * never a rearrangement of it. A snapshot already within `limit` is returned
 * untouched.
 *
 * Past `limit` the tail is taken and then advanced past its first row break,
 * so the preview opens on a whole row rather than the middle of one. A row
 * break rather than an erase-display: the agents this actually holds — Claude
 * and Codex — render inline and never clear the screen, so keying on `[2J`
 * would have been a branch that never ran on real output. A bare carriage
 * return counts, because an inline agent redrawing its status returns to
 * column 0 without ever ending the line.
 *
 * What remains can still begin mid escape sequence, exactly as the untrimmed
 * snapshot could — it is a tail of a bounded ring either way — which is what
 * the caller's `reset()` is there to absorb.
 */
export function previewSlice(
  snapshot: string | null | undefined,
  limit: number = PREVIEW_TAIL_CHARS,
): string {
  if (!snapshot || snapshot.length <= limit) return snapshot ?? "";
  const tail = snapshot.slice(-limit);
  const boundary = ROW_BREAK.exec(tail.slice(0, MAX_BOUNDARY_SCAN));
  return boundary ? tail.slice(boundary.index + boundary[0].length) : tail;
}
