/* The parsed diff, flattened into the one uniform-height row list the window
 * scrolls over.
 *
 * Flattening is what makes virtualisation cheap: every row — hunk header,
 * line, elided run, note — is exactly one line tall, so the list's height is
 * `rows.length * rowHeight` and the visible slice is arithmetic rather than
 * measurement. Collapsing lives here too, because an expanded gap changes the
 * row list and nothing else. */

import { refineHunk, type WordSpan } from "./diffWords.ts";
import type { DiffLineKind, ParsedDiff } from "./diffParse.ts";

/** Unchanged lines kept either side of a change before the rest is elided. */
export const DEFAULT_CONTEXT = 3;

/** Below this a gap row saves no height, so the lines are simply shown. */
const MIN_ELIDE = 2;

export interface HunkRow {
  type: "hunk";
  key: string;
  /** The range, rebuilt canonically rather than echoed: git's own header
   *  trails the section hint, and splitting the two back apart by hand is a
   *  guess as soon as that hint contains an `@@`. */
  range: string;
  heading: string;
}

export interface LineRow {
  type: "line";
  key: string;
  kind: DiffLineKind;
  text: string;
  oldNumber: number | null;
  newNumber: number | null;
  noNewline: boolean;
  marks: WordSpan[] | null;
}

export interface GapRow {
  type: "gap";
  key: string;
  count: number;
}

export interface NoteRow {
  type: "note";
  key: string;
  text: string;
}

export type DiffRow = HunkRow | LineRow | GapRow | NoteRow;

export interface DiffRowList {
  rows: DiffRow[];
  /** Widest line number in the diff, in digits — the gutter sizes from it. */
  digits: number;
}

function digitsOf(parsed: ParsedDiff): number {
  let widest = 0;
  for (const hunk of parsed.hunks) {
    widest = Math.max(widest, hunk.oldStart + hunk.oldCount, hunk.newStart + hunk.newCount);
  }
  return Math.max(2, String(Math.max(1, widest)).length);
}

/** Which lines survive collapsing: every change, plus `context` either side. */
function keptLines(kinds: readonly DiffLineKind[], context: number): boolean[] {
  const keep = kinds.map(() => false);
  kinds.forEach((kind, index) => {
    if (kind === "context") return;
    const from = Math.max(0, index - context);
    const to = Math.min(kinds.length - 1, index + context);
    for (let at = from; at <= to; at += 1) keep[at] = true;
  });
  return keep;
}

/**
 * The row list for a parsed diff.
 *
 * `expanded` holds the keys of gap rows the reader has opened; a gap's key is
 * derived from its position, so expansion survives a re-render but not a
 * different diff — which is what you want, since it is a different file.
 */
export function buildRows(
  parsed: ParsedDiff,
  expanded: ReadonlySet<string> = new Set(),
  context = DEFAULT_CONTEXT,
): DiffRowList {
  const rows: DiffRow[] = [];

  parsed.hunks.forEach((hunk, hunkIndex) => {
    const range = `@@ -${hunk.oldStart},${hunk.oldCount} +${hunk.newStart},${hunk.newCount} @@`;
    rows.push({ type: "hunk", key: `h${hunkIndex}`, range, heading: hunk.heading });
    const marks = refineHunk(hunk.lines);
    const keep = keptLines(
      hunk.lines.map((line) => line.kind),
      context,
    );

    const push = (index: number) => {
      const line = hunk.lines[index];
      rows.push({
        type: "line",
        key: `h${hunkIndex}l${index}`,
        kind: line.kind,
        text: line.text,
        oldNumber: line.oldNumber,
        newNumber: line.newNumber,
        noNewline: line.noNewline,
        marks: marks[index],
      });
    };

    let at = 0;
    while (at < hunk.lines.length) {
      if (keep[at]) {
        push(at);
        at += 1;
        continue;
      }
      let end = at;
      while (end < hunk.lines.length && !keep[end]) end += 1;
      const key = `h${hunkIndex}g${at}`;
      if (end - at < MIN_ELIDE || expanded.has(key)) {
        for (let index = at; index < end; index += 1) push(index);
      } else {
        rows.push({ type: "gap", key, count: end - at });
      }
      at = end;
    }
  });

  if (rows.length === 0) {
    const notes = parsed.meta.notes.length > 0 ? parsed.meta.notes : ["No changes to show."];
    notes.forEach((text, index) => rows.push({ type: "note", key: `n${index}`, text }));
  }

  return { rows, digits: digitsOf(parsed) };
}
