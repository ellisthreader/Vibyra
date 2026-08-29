import type { GapRow } from "./diffRows.ts";

/**
 * An elided run of unchanged lines, and the click that brings it back.
 *
 * It expands in place rather than opening anything: the reader wanted a little
 * more of the same file, not a new surface. Once open it stays open — the row
 * list simply grows, and the window recomputes around it.
 */
export function DiffGapRow({ row, onExpand }: { row: GapRow; onExpand: (key: string) => void }) {
  return (
    <button type="button" className="review-diff__gap" onClick={() => onExpand(row.key)}>
      <span className="review-diff__gap-mark" aria-hidden="true">
        ⋯
      </span>
      {row.count.toLocaleString()} unchanged {row.count === 1 ? "line" : "lines"}
    </button>
  );
}
