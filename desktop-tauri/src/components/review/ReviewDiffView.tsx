import { useMemo, useState } from "react";

import { DiffRow } from "./diff/DiffRow";
import { parseDiff } from "./diff/diffParse.ts";
import { buildRows, DEFAULT_CONTEXT } from "./diff/diffRows.ts";
import { useDiffWindow } from "./diff/useDiffWindow.ts";

const NO_KEYS: ReadonlySet<string> = new Set();

interface Opened {
  source: string;
  keys: ReadonlySet<string>;
}

/**
 * A file's diff, parsed into hunks and read through a window.
 *
 * The old view rendered every line as a span and capped itself at 400 with a
 * "show all" button — which meant a 512 KiB diff was either truncated or tens
 * of thousands of elements. Both are gone: the list is windowed, so the DOM
 * holds the visible rows and a little overscan whatever the diff's size, and
 * the whole patch is always reachable by scrolling.
 *
 * Unchanged runs collapse to three lines either side of a change, because in a
 * dock-width column the context is scenery and the change is the point.
 */
export function ReviewDiffView({
  diff,
  contextLines = DEFAULT_CONTEXT,
}: {
  diff: string;
  contextLines?: number;
}) {
  // Gap keys are positional, so an expansion belongs to the diff it was made
  // in. Carrying the source with them retires them the moment it changes,
  // without an effect that would render the wrong rows first.
  const [opened, setOpened] = useState<Opened>({ source: diff, keys: NO_KEYS });
  const expanded = opened.source === diff ? opened.keys : NO_KEYS;

  // Reparsing on a scroll frame would hand a 512 KiB diff back its old cost,
  // so the patch is read once per diff and flattened once per expansion.
  const parsed = useMemo(() => parseDiff(diff), [diff]);
  const { rows, digits } = useMemo(
    () => buildRows(parsed, expanded, contextLines),
    [parsed, expanded, contextLines],
  );
  const { scrollRef, probeRef, rowHeight, window: view } = useDiffWindow(rows.length);
  const sized = rowHeight > 0;

  const expand = (key: string) =>
    setOpened((prev) => ({
      source: diff,
      keys: new Set(prev.source === diff ? prev.keys : []).add(key),
    }));

  return (
    <div className="review-diff" ref={scrollRef} tabIndex={0} role="region" aria-label="File diff">
      {/* Measured, never assumed: one real row, out of flow and out of the
          accessibility tree, is what the window's arithmetic is built on. */}
      <div className="review-diff__row review-diff__probe" ref={probeRef} aria-hidden="true">
        <span className="review-diff__gutter">
          <span className="review-diff__num">0</span>
        </span>
        <code className="review-diff__code">0</code>
      </div>
      <div
        className={sized ? "review-diff__body review-diff__body--sized" : "review-diff__body"}
        style={sized ? { height: `${rows.length * rowHeight}px` } : undefined}
      >
        {rows.slice(view.start, view.end).map((row, offset) => (
          <DiffRow
            key={row.key}
            row={row}
            index={view.start + offset}
            rowHeight={rowHeight}
            digits={digits}
            onExpand={expand}
          />
        ))}
      </div>
    </div>
  );
}
