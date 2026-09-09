import { terminalGridLayout } from "./gridLayout.ts";
import { spawnDimensionsFor } from "./spawnGeometry.ts";
import { measuredCellSize } from "./terminalRegistry.ts";

// Measures the live stage for `spawnGeometry`, which owns the arithmetic and
// explains why the prediction deliberately undershoots.

function fallbackCell(fontSize: number): { width: number; height: number } {
  // JetBrains Mono advance ≈ 0.6em; xterm's default line height lands the
  // cell around 1.33em. Only reached for the very first pane, before any
  // terminal exists to measure — the first fit corrects the remainder.
  return { width: fontSize * 0.6, height: fontSize * 1.33 };
}

export function estimateSpawnDimensions(
  paneCount: number,
  fontSize: number,
): { rows: number; cols: number } | null {
  const stage = document.querySelector<HTMLElement>(".terminal-stage");
  if (!stage) return null;
  const rect = stage.getBoundingClientRect();
  if (rect.width < 120 || rect.height < 90) return null;

  const count = Math.max(1, paneCount);
  const cell = measuredCellSize() ?? fallbackCell(fontSize);
  const layout = terminalGridLayout(count, {
    width: rect.width,
    height: rect.height,
    cellWidth: cell.width,
    cellHeight: cell.height,
    fontSize,
  });

  // The cell the pane will render at, not the one measured off today's grid.
  // Rounded up because a cell guessed too small predicts too many columns, and
  // a PTY wider than the xterm grid is the one error that leaves a pane sheared.
  const scale = layout.fontSize / fontSize;
  const stageHeight =
    layout.paneHeight * layout.rows +
    layout.chrome.padding * 2 +
    layout.chrome.gap * (layout.rows - 1);
  return spawnDimensionsFor({
    stageWidth: layout.paneWidth * layout.columns +
      layout.chrome.padding * 2 +
      layout.chrome.gap * (layout.columns - 1),
    stageHeight,
    columns: layout.columns,
    paneRows: layout.rows,
    cellWidth: Math.ceil(cell.width * scale),
    cellHeight: Math.ceil(cell.height * scale),
    chrome: layout.chrome,
  });
}
