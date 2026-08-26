import { paletteScore, parsePaletteQuery, type PaletteScope } from "./paletteQuery.ts";
import { readPaletteRecents, recencyBoost } from "./paletteRecents.ts";
import type { CommandPaletteEntry, PaletteKind, PaletteResult } from "./paletteTypes";

// Turning "what did they type" into "what should the list show". Pure, and
// separate from the entries themselves, because the entries reach into every
// store in the app and this is the part worth pinning down.

const SCOPE_KINDS: Record<PaletteScope, Set<PaletteKind> | null> = {
  all: null,
  command: new Set(["command"]),
  session: new Set(["session", "attention"]),
  project: new Set(["project"]),
  // Ask never draws from the base list; its rows are built from the message.
  ask: new Set([]),
};

/** Builds the send-to rows for `!` mode. Injected so this file stays pure. */
export type AskBuilder = (text: string) => CommandPaletteEntry[];

export function rankPaletteEntries(
  base: CommandPaletteEntry[],
  raw: string,
  buildAsk: AskBuilder,
  recents = readPaletteRecents(),
): PaletteResult {
  const { scope, text } = parsePaletteQuery(raw);
  const kinds = SCOPE_KINDS[scope];
  const pool =
    scope === "ask" ? buildAsk(text) : kinds ? base.filter((entry) => kinds.has(entry.kind)) : base;

  // Ask mode has already answered the query by building its rows from it.
  // Scoring "run the tests" against "Send to Claude" would throw away every
  // row whose target the user did not happen to name.
  if (scope === "ask" || !text) {
    return { scope, text, entries: pool.map((entry) => ({ ...entry, ranges: [] })), grouped: true };
  }

  const scored = [];
  for (const entry of pool) {
    const match = paletteScore(entry.label, entry.keywords, text);
    if (!match) continue;
    scored.push({
      entry: { ...entry, ranges: match.ranges },
      score: match.score + (entry.weight ?? 0) + recencyBoost(entry.id, recents),
    });
  }
  // Ranked rather than grouped: once a query has ordered the rows, headings
  // would cut that order into islands that each start over.
  scored.sort((left, right) => right.score - left.score);
  return { scope, text, entries: scored.map((item) => item.entry), grouped: false };
}
