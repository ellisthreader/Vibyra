/* Which rows a scroll position puts on screen.
 *
 * Kept apart from the hook so the arithmetic is testable without a layout, and
 * so the one property that matters is stated in one place: the slice is a
 * function of the scroll offset alone, never of the diff's size. Ten rows or
 * ten thousand, the window costs the same. */

/** Rows rendered beyond each edge, so a flick does not show bare ground. */
export const OVERSCAN = 8;

export interface RowWindow {
  start: number;
  end: number;
}

/**
 * The half-open row range to render.
 *
 * `rowHeight` is measured, never assumed — a zero or negative one means the
 * probe has not been read yet, and the caller gets a small opening slice that
 * is enough to render something to measure.
 */
export function rowWindow(
  count: number,
  rowHeight: number,
  scrollTop: number,
  viewport: number,
  overscan = OVERSCAN,
): RowWindow {
  if (count <= 0) return { start: 0, end: 0 };
  if (!(rowHeight > 0)) return { start: 0, end: Math.min(count, overscan * 2) };

  const top = Math.max(0, scrollTop);
  const rows = Math.max(1, Math.ceil(Math.max(0, viewport) / rowHeight));
  const first = Math.floor(top / rowHeight);
  // Both ends clamp to the list: a scroll offset left over from a longer diff
  // would otherwise ask for a window past its end.
  const start = Math.min(count, Math.max(0, first - overscan));
  const end = Math.min(count, first + rows + overscan + 1);
  return { start, end: Math.max(start, end) };
}
