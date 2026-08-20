import assert from "node:assert/strict";
import test from "node:test";

import { spawnDimensionsFor } from "../src/lib/spawnGeometry.ts";

// Mirrors FitAddon.proposeDimensions() for the box `.term-host` ends up with:
// the pane minus its 36px header, the `.term-view` padding and the scrollbar
// gutter xterm reserves while scrollback is on.
const HEADER = 36;
const INSET = 12;
const SCROLLBAR = 14;

function fitAddonGrid({ stageWidth, stageHeight, columns, paneRows, cellWidth, cellHeight }) {
  const hostWidth = Math.floor(stageWidth / columns) - INSET;
  const hostHeight = Math.floor(stageHeight / paneRows) - HEADER - INSET;
  return {
    cols: Math.max(2, Math.floor((hostWidth - SCROLLBAR) / cellWidth)),
    rows: Math.max(1, Math.floor(hostHeight / cellHeight)),
  };
}

// A 13px JetBrains Mono cell, as measured off a live pane.
const CELL = { cellWidth: 7.8, cellHeight: 17.33 };

test("reserves the scrollbar gutter the old estimate spent on columns", () => {
  const geometry = {
    stageWidth: 1152,
    stageHeight: 940,
    columns: 2,
    paneRows: 2,
    ...CELL,
  };
  // floor((576 - 12) / 7.8) = 72 columns was handed to the PTY while xterm
  // built 70, so every line the CLI drew wrapped a row early.
  assert.equal(fitAddonGrid(geometry).cols, 70);
  assert.deepEqual(spawnDimensionsFor(geometry), { rows: 23, cols: 69 });
});

test("never predicts a grid larger than the first fit will build", () => {
  for (let stageWidth = 760; stageWidth <= 2560; stageWidth += 7) {
    for (let stageHeight = 620; stageHeight <= 1600; stageHeight += 11) {
      for (const [columns, paneRows] of [
        [1, 1],
        [2, 1],
        [2, 2],
        [3, 2],
        [3, 3],
        [4, 3],
      ]) {
        const geometry = { stageWidth, stageHeight, columns, paneRows, ...CELL };
        const fitted = fitAddonGrid(geometry);
        if (fitted.cols < 21 || fitted.rows < 6) continue; // below our clamp floor
        const predicted = spawnDimensionsFor(geometry);
        assert.ok(predicted, `no prediction for ${stageWidth}x${stageHeight}`);
        const where = `${stageWidth}x${stageHeight} @ ${columns}x${paneRows}`;
        assert.ok(
          predicted.cols <= fitted.cols,
          `${where}: ${predicted.cols} cols overshoots ${fitted.cols}`,
        );
        assert.ok(
          predicted.rows <= fitted.rows,
          `${where}: ${predicted.rows} rows overshoots ${fitted.rows}`,
        );
        // Undershooting is safe but must stay within one cell, or the pane
        // visibly reflows on spawn.
        assert.ok(predicted.cols >= fitted.cols - 1, `${where}: ${predicted.cols} cols too narrow`);
        assert.ok(predicted.rows >= fitted.rows - 1, `${where}: ${predicted.rows} rows too short`);
      }
    }
  }
});

test("tolerates a mismeasured cell without overshooting the fit", () => {
  // The very first pane has no live terminal to measure and falls back to a
  // 0.6em/1.33em guess; the reference here fits at the real cell size.
  const stage = { stageWidth: 1600, stageHeight: 1000, columns: 1, paneRows: 1 };
  const guess = spawnDimensionsFor({ ...stage, cellWidth: 7.8, cellHeight: 17.29 });
  const fitted = fitAddonGrid({ ...stage, ...CELL });
  assert.ok(guess.cols <= fitted.cols);
  assert.ok(guess.rows <= fitted.rows);
});

test("declines to guess for degenerate geometry", () => {
  const base = { stageWidth: 1200, stageHeight: 900, columns: 2, paneRows: 2, ...CELL };
  assert.equal(spawnDimensionsFor({ ...base, cellWidth: 0 }), null);
  assert.equal(spawnDimensionsFor({ ...base, cellHeight: 0 }), null);
  assert.equal(spawnDimensionsFor({ ...base, columns: 0 }), null);
  assert.equal(spawnDimensionsFor({ ...base, stageWidth: 30 }), null);
  assert.equal(spawnDimensionsFor({ ...base, stageHeight: 90 }), null);
});
