/* Intra-line word diff, so a one-character change does not read as a rewrite.
 *
 * Deliberately small: a common prefix and suffix trim removes most of the work,
 * and a word-level LCS settles what is left. Everything here is bounded — a
 * minified bundle or a long generated line is left unrefined rather than paid
 * for quadratically, because an unmarked line still reads correctly and a
 * stalled dock does not.
 *
 * Lines are only paired when a hunk holds an equal-length run of deletions
 * followed by additions. Anything else is a guess about which line replaced
 * which, and a wrong mark is worse than no mark. */

export interface WordSpan {
  start: number;
  end: number;
}

export interface LinePairDiff {
  del: WordSpan[];
  add: WordSpan[];
}

/** Longer than this and the line is machine output, not something being read. */
const MAX_LINE = 400;
/** The LCS table's ceiling, per side, after the prefix and suffix are gone. */
const MAX_TOKENS = 120;
/** A run longer than this is a block rewrite; pairing it means nothing. */
const MAX_RUN = 60;

const TOKEN = /[A-Za-z0-9_]+|\s+|[^A-Za-z0-9_\s]/g;

function tokenize(text: string): string[] {
  return text.match(TOKEN) ?? [];
}

function span(tokens: string[], from: number, to: number, offset: number): WordSpan | null {
  if (to <= from) return null;
  let start = offset;
  for (let i = 0; i < from; i += 1) start += tokens[i].length;
  let end = start;
  for (let i = from; i < to; i += 1) end += tokens[i].length;
  return { start, end };
}

/** Merges spans that touch, so `foo` + `(` render as one mark, not two. */
function pack(spans: WordSpan[]): WordSpan[] {
  const packed: WordSpan[] = [];
  for (const next of spans) {
    const last = packed[packed.length - 1];
    if (last && last.end === next.start) last.end = next.end;
    else packed.push({ ...next });
  }
  return packed;
}

function lcsTable(a: string[], b: string[]): number[][] {
  const table: number[][] = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      table[i][j] = a[i] === b[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
    }
  }
  return table;
}

/**
 * The segments that differ between a removed line and the line that replaced
 * it, as character ranges into each. Null when refinement is not worth it:
 * identical lines, a line long enough to be machine output, or a middle so
 * large the table would cost more than the mark is worth.
 */
export function refineLinePair(oldText: string, newText: string): LinePairDiff | null {
  if (oldText === newText) return null;
  if (oldText.length > MAX_LINE || newText.length > MAX_LINE) return null;

  const a = tokenize(oldText);
  const b = tokenize(newText);
  let head = 0;
  while (head < a.length && head < b.length && a[head] === b[head]) head += 1;
  let tail = 0;
  while (tail < a.length - head && tail < b.length - head && a[a.length - 1 - tail] === b[b.length - 1 - tail]) {
    tail += 1;
  }

  const aMid = a.slice(head, a.length - tail);
  const bMid = b.slice(head, b.length - tail);
  const offsetA = a.slice(0, head).join("").length;
  const offsetB = b.slice(0, head).join("").length;

  // Too big to walk: mark the whole changed middle rather than nothing, which
  // still beats colouring the entire line.
  if (aMid.length > MAX_TOKENS || bMid.length > MAX_TOKENS) {
    const del = span(aMid, 0, aMid.length, offsetA);
    const add = span(bMid, 0, bMid.length, offsetB);
    return { del: del ? [del] : [], add: add ? [add] : [] };
  }

  const table = lcsTable(aMid, bMid);
  const del: WordSpan[] = [];
  const add: WordSpan[] = [];
  let i = 0;
  let j = 0;
  while (i < aMid.length && j < bMid.length) {
    if (aMid[i] === bMid[j]) {
      i += 1;
      j += 1;
    } else if (table[i + 1][j] >= table[i][j + 1]) {
      const only = span(aMid, i, i + 1, offsetA);
      if (only) del.push(only);
      i += 1;
    } else {
      const only = span(bMid, j, j + 1, offsetB);
      if (only) add.push(only);
      j += 1;
    }
  }
  const restDel = span(aMid, i, aMid.length, offsetA);
  if (restDel) del.push(restDel);
  const restAdd = span(bMid, j, bMid.length, offsetB);
  if (restAdd) add.push(restAdd);

  return { del: pack(del), add: pack(add) };
}

interface PairableLine {
  kind: "add" | "del" | "context";
  text: string;
}

/**
 * Word marks for a whole hunk, one entry per line, parallel to the input.
 * A run of deletions immediately followed by the same number of additions is
 * read as a rewrite in place and paired line for line; everything else is left
 * null, because nothing here knows which line replaced which.
 */
export function refineHunk(lines: readonly PairableLine[]): (WordSpan[] | null)[] {
  const marks: (WordSpan[] | null)[] = lines.map(() => null);
  let at = 0;
  while (at < lines.length) {
    if (lines[at].kind !== "del") {
      at += 1;
      continue;
    }
    let dels = at;
    while (dels < lines.length && lines[dels].kind === "del") dels += 1;
    let adds = dels;
    while (adds < lines.length && lines[adds].kind === "add") adds += 1;

    const run = dels - at;
    if (run === adds - dels && run > 0 && run <= MAX_RUN) {
      for (let step = 0; step < run; step += 1) {
        const pair = refineLinePair(lines[at + step].text, lines[dels + step].text);
        if (!pair) continue;
        marks[at + step] = pair.del;
        marks[dels + step] = pair.add;
      }
    }
    at = adds > at ? adds : at + 1;
  }
  return marks;
}
