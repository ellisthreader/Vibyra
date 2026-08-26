// What the command palette does with what you type.
//
// Pure on purpose: the palette now carries enough entries that ranking is the
// difference between a list and a search, and ranking judged by eye is ranking
// nobody can change safely later.

/** Which slice of the palette a leading punctuation character asks for. */
export type PaletteScope = "all" | "command" | "session" | "project" | "ask";

export interface PaletteQuery {
  scope: PaletteScope;
  /** What was typed, with the scope character removed. */
  text: string;
}

/** The prefixes, in the order the footer offers them. */
export const PALETTE_SCOPES: { prefix: string; scope: PaletteScope; label: string }[] = [
  { prefix: ">", scope: "command", label: "Commands" },
  { prefix: "@", scope: "session", label: "Sessions" },
  { prefix: "#", scope: "project", label: "Projects" },
  { prefix: "!", scope: "ask", label: "Ask an agent" },
];

export function parsePaletteQuery(raw: string): PaletteQuery {
  const found = PALETTE_SCOPES.find((candidate) => raw.startsWith(candidate.prefix));
  if (!found) return { scope: "all", text: raw.trim() };
  return { scope: found.scope, text: raw.slice(found.prefix.length).trim() };
}

/** A half-open [start, end) slice of the label that the query matched. */
export type PaletteRange = [number, number];

export interface PaletteMatch {
  score: number;
  ranges: PaletteRange[];
}

const EMPTY_MATCH: PaletteMatch = { score: 0, ranges: [] };
const BOUNDARY = /[\s\-_./:·—]/;

function isBoundary(haystack: string, index: number): boolean {
  return index === 0 || BOUNDARY.test(haystack[index - 1]);
}

/** Folds adjacent hits so "term" highlights as one run rather than four. */
function pushIndex(ranges: PaletteRange[], index: number): void {
  const last = ranges[ranges.length - 1];
  if (last && last[1] === index) last[1] = index + 1;
  else ranges.push([index, index + 1]);
}

/**
 * Scores a label against a query.
 *
 * A contiguous hit always beats a scattered one, and a hit at the start of a
 * word beats one buried mid-token — so "res" finds "Restart agent" before it
 * finds "Toggle side panel". Returns null when the query is not in the label
 * at all; an empty query matches everything at zero.
 */
export function paletteMatch(haystack: string, query: string): PaletteMatch | null {
  if (!query) return EMPTY_MATCH;
  const text = haystack.toLowerCase();
  const needle = query.toLowerCase();

  const direct = text.indexOf(needle);
  if (direct >= 0) {
    // Whole-phrase hits are in a league of their own, and one at the front of
    // a word is what the user almost always meant.
    const boundary = isBoundary(haystack, direct) ? 400 : 0;
    return { score: 1_000 + boundary - Math.min(direct, 40) * 2, ranges: [[direct, direct + needle.length]] };
  }

  const ranges: PaletteRange[] = [];
  let score = 0;
  let cursor = 0;
  let previous = -2;
  for (const character of needle) {
    const index = text.indexOf(character, cursor);
    if (index < 0) return null;
    score += 10;
    if (index === previous + 1) score += 14;
    if (isBoundary(haystack, index)) score += 20;
    score -= Math.min(index - cursor, 12);
    pushIndex(ranges, index);
    previous = index;
    cursor = index + 1;
  }
  return { score: Math.max(score, 1), ranges };
}

/**
 * The best of a label and its hidden search terms.
 *
 * Keywords let "kill" reach "Stop agent" without either word appearing in the
 * other, but they never light up the label, so a keyword hit is deliberately
 * worth less than a visible one.
 */
export function paletteScore(label: string, keywords: string | undefined, query: string): PaletteMatch | null {
  const direct = paletteMatch(label, query);
  if (direct) return direct;
  if (!keywords) return null;
  const hidden = paletteMatch(keywords, query);
  return hidden ? { score: Math.round(hidden.score * 0.6), ranges: [] } : null;
}
