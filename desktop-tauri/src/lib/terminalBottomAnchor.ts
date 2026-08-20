import type { Terminal } from "@xterm/xterm";

type ViewportTerminal = Pick<Terminal, "buffer" | "element" | "rows" | "scrollToBottom">;

/**
 * Mutable anchor state owned by the registry entry. Caching the rendered cell
 * height and the applied offset keeps the per-output-batch work free of
 * forced layout (no getBoundingClientRect / querySelector in the write path).
 */
export interface BottomAnchorState {
  enabled: boolean;
  /** Rendered cell height; re-measured on fit/resize, never per write. */
  cellHeight: number;
  /** translateY currently applied, so unchanged frames skip style writes. */
  appliedOffset: number;
}

export function createBottomAnchorState(enabled: boolean): BottomAnchorState {
  return { enabled, cellHeight: 0, appliedOffset: 0 };
}

export function terminalViewportIsNearBottom(
  term: Pick<Terminal, "buffer">,
  threshold = 2,
): boolean {
  const buffer = term.buffer.active;
  return buffer.baseY - buffer.viewportY <= threshold;
}

/** Number of unused rows below the active cursor/content in the visible screen. */
export function terminalBottomAnchorRows(
  term: Pick<Terminal, "buffer" | "rows">,
): number {
  const buffer = term.buffer.active;
  const rows = Math.max(0, term.rows);
  if (!rows) return 0;

  // Rows at or above the cursor can never raise the max, so only the rows
  // below it need scanning — for composer-style TUIs that is a handful.
  const cursorRow = Math.min(rows - 1, Math.max(0, buffer.cursorY));
  let lastOccupiedRow = cursorRow;
  for (let row = rows - 1; row > cursorRow; row -= 1) {
    const line = buffer.getLine(buffer.viewportY + row);
    if (!line?.translateToString(true).trim()) continue;
    lastOccupiedRow = row;
    break;
  }
  return Math.max(0, rows - lastOccupiedRow - 1);
}

export function terminalBottomAnchorPixels(blankRows: number, cellHeight: number): number {
  if (!Number.isFinite(cellHeight) || cellHeight <= 0) return 0;
  return Math.max(0, blankRows) * cellHeight;
}

/** Measures the rendered cell height. Forces layout — call on fit, not per write. */
export function measureTerminalCellHeight(term: ViewportTerminal): number {
  const element = term.element;
  const row = element?.querySelector<HTMLElement>(".xterm-rows > div");
  const rowHeight = row?.getBoundingClientRect().height ?? 0;
  if (rowHeight > 0) return rowHeight;

  const screen = element?.querySelector<HTMLElement>(".xterm-screen");
  const screenHeight = screen?.getBoundingClientRect().height ?? 0;
  return term.rows > 0 ? screenHeight / term.rows : 0;
}

/**
 * Keeps a native CLI composer at the pane bottom without disturbing manual
 * scrollback. The transform changes paint only; xterm and the PTY retain the
 * same row ownership and input coordinates.
 */
export function applyTerminalBottomAnchor(
  term: ViewportTerminal,
  anchor: BottomAnchorState,
  followOutput = false,
): void {
  const element = term.element;
  if (!element) return;
  if (!anchor.enabled || !terminalViewportIsNearBottom(term)) {
    if (anchor.appliedOffset !== 0) {
      anchor.appliedOffset = 0;
      element.style.transform = "";
    }
    return;
  }
  if (followOutput) term.scrollToBottom();

  if (anchor.cellHeight <= 0) anchor.cellHeight = measureTerminalCellHeight(term);
  const offset = terminalBottomAnchorPixels(
    terminalBottomAnchorRows(term),
    anchor.cellHeight,
  );
  if (offset === anchor.appliedOffset) return;
  anchor.appliedOffset = offset;
  element.style.transform = offset > 0 ? `translateY(${offset}px)` : "";
}
