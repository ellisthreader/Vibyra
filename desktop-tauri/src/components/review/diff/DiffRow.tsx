import { DiffGapRow } from "./DiffGapRow";
import { DiffLineRow } from "./DiffLineRow";
import type { DiffRow as Row } from "./diffRows.ts";

/**
 * One row of the window, positioned by index.
 *
 * Every kind is exactly one line tall, which is the contract the window rests
 * on: `top` is `index * rowHeight` and nothing is ever measured per row. Keep
 * every row single-line — `white-space: pre` and no wrapping — if you add one.
 */
export function DiffRow({
  row,
  index,
  rowHeight,
  digits,
  onExpand,
}: {
  row: Row;
  index: number;
  rowHeight: number;
  digits: number;
  onExpand: (key: string) => void;
}) {
  const style = rowHeight > 0 ? { top: `${index * rowHeight}px` } : undefined;
  // A line's tint is its kind, not its type — the sheet colours on the kind.
  const tint = row.type === "line" ? ` review-diff__row--${row.kind}` : "";
  return (
    <div className={`review-diff__row review-diff__row--${row.type}${tint}`} style={style}>
      {row.type === "line" && <DiffLineRow row={row} digits={digits} />}
      {row.type === "gap" && <DiffGapRow row={row} onExpand={onExpand} />}
      {row.type === "hunk" && (
        <>
          <span className="review-diff__range">{row.range}</span>
          {row.heading && <span className="review-diff__heading">{row.heading}</span>}
        </>
      )}
      {row.type === "note" && <span className="review-diff__note">{row.text}</span>}
    </div>
  );
}
