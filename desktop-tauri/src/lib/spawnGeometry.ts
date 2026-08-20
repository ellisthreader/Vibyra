// Predicts the cell grid FitAddon will pick for a pane that does not exist
// yet, so the PTY opens at (about) the right size instead of the backend
// default — CLIs then draw their first frame without a resize reflow, which
// is what made spawns look glitchy.
//
// The arithmetic mirrors FitAddon.proposeDimensions(). What it measures is
// `.term-host` — the pane minus its header and the `.term-view` padding —
// which FitAddon reads back through getComputedStyle/parseInt, so the whole
// pixels are floored at the same points here.
//
// The result is then held back by one cell per axis, because the two error
// directions are not symmetric. A PTY *wider* than the xterm grid makes
// every line the CLI draws wrap one row early; a TUI that repaints in place
// (Ink, Bubble Tea) then erases the wrong number of rows and the pane shears
// for good. A PTY narrower or shorter than the grid only leaves an unused
// margin, which the mount-time size sync in `terminalRegistry` closes on the
// next frame.

/** Pane chrome around the xterm host: header row + `.term-view` padding. */
export const PANE_HEADER_PX = 36;
export const TERM_INSET_X = 12;
export const TERM_INSET_Y = 12;

/**
 * xterm's `ViewportConstants.DEFAULT_SCROLL_BAR_WIDTH`. FitAddon subtracts it
 * from the available width whenever `scrollback > 0`, so leaving it out here
 * made every predicted grid ~2 columns wider than the one xterm builds.
 */
export const SCROLLBAR_PX = 14;

/** Cells held back so a misprediction can only ever undershoot. */
const SAFETY_CELLS = 1;

const MIN_COLS = 20;
const MAX_COLS = 500;
const MIN_ROWS = 5;
const MAX_ROWS = 240;

export interface PaneGeometry {
  /** Bounding box of `.terminal-stage`, which the grid fills exactly. */
  stageWidth: number;
  stageHeight: number;
  /** Grid tracks the stage will be split into once the new pane is added. */
  columns: number;
  paneRows: number;
  /** Rendered cell size, ideally measured off a live terminal. */
  cellWidth: number;
  cellHeight: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.floor(value)));
}

export function spawnDimensionsFor(geometry: PaneGeometry): { rows: number; cols: number } | null {
  const { stageWidth, stageHeight, columns, paneRows, cellWidth, cellHeight } = geometry;
  if (columns < 1 || paneRows < 1 || cellWidth <= 0 || cellHeight <= 0) return null;

  const hostWidth = Math.floor(stageWidth / columns) - TERM_INSET_X;
  const hostHeight = Math.floor(stageHeight / paneRows) - PANE_HEADER_PX - TERM_INSET_Y;
  const usableWidth = hostWidth - SCROLLBAR_PX;
  if (usableWidth <= 0 || hostHeight <= 0) return null;

  return {
    cols: clamp(usableWidth / cellWidth - SAFETY_CELLS, MIN_COLS, MAX_COLS),
    rows: clamp(hostHeight / cellHeight - SAFETY_CELLS, MIN_ROWS, MAX_ROWS),
  };
}
