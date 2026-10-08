import { terminalGridColumns } from "./terminalGridColumns.ts";
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
  const columns = terminalGridColumns(count, rect.width - 16, rect.height - 16);
  return spawnDimensionsFor({
    stageWidth: rect.width,
    stageHeight: rect.height,
    columns,
    paneRows: Math.ceil(count / columns),
    cellWidth: Math.ceil(cell.width),
    cellHeight: Math.ceil(cell.height),
    chrome: { header: 34, insetX: 12, insetY: 12, gap: 8, padding: 8 },
  });
}
