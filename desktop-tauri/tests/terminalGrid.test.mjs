import assert from "node:assert/strict";
import test from "node:test";

import { terminalGridLayout } from "../src/lib/gridLayout.ts";
import { PANE_BORDER_PX, SCROLLBAR_PX } from "../src/lib/paneChrome.ts";

// A 13px JetBrains Mono cell, as measured off a live pane.
const CELL = { cellWidth: 7.8, cellHeight: 17.33, fontSize: 13 };
// The window this was reported from: a near-fullscreen Vibyra on a 14" Mac.
const LAPTOP = { width: 1193, height: 872, ...CELL };
const DISPLAY = { width: 1800, height: 1000, ...CELL };

/** What a pane in this layout actually shows, in characters. */
function text(layout, metrics) {
  const scale = layout.fontSize / metrics.fontSize;
  const width = layout.paneWidth - PANE_BORDER_PX - layout.chrome.insetX - SCROLLBAR_PX;
  const height = layout.paneHeight - PANE_BORDER_PX - layout.chrome.header - layout.chrome.insetY;
  return {
    cols: Math.floor(width / (metrics.cellWidth * scale)),
    rows: Math.floor(height / (metrics.cellHeight * scale)),
  };
}

const layoutFor = (count, metrics) => terminalGridLayout(count, metrics);

test("a grid that already fits is left exactly as it was", () => {
  // Up to six panes the old ladder and this agree, and the panes are roomy
  // enough that nothing needs trading. Regressing these is regressing the app.
  for (const [count, columns] of [[1, 1], [2, 2], [3, 3], [4, 2], [5, 3], [6, 3]]) {
    const layout = layoutFor(count, LAPTOP);
    assert.equal(layout.columns, columns, `${count} panes`);
    assert.equal(layout.density, "comfortable", `${count} panes keeps the full frame`);
    assert.equal(layout.fontSize, CELL.fontSize, `${count} panes keeps the configured font`);
    assert.equal(layout.scrolls, false);
  }
});

test("past six panes every terminal still shows a readable view", () => {
  // The reported bug: the seventh pane added a third row and every terminal
  // dropped to about twelve lines of 46 columns. That is the floor this holds.
  for (let count = 7; count <= 16; count += 1) {
    const layout = layoutFor(count, LAPTOP);
    const { cols, rows } = text(layout, LAPTOP);
    assert.ok(rows >= 13, `${count} panes: ${rows} lines is too few to follow`);
    assert.ok(cols >= 44, `${count} panes: ${cols} columns wraps too hard`);
    assert.equal(layout.scrolls, false, `${count} panes should still fit the stage`);
  }
});

test("eight panes trade frame and font for two thirds more lines", () => {
  const layout = layoutFor(8, LAPTOP);
  const { cols, rows } = text(layout, LAPTOP);
  // What the old fixed 3x3 at a 44px header and a 13px font produced.
  assert.ok(rows > 12 && cols > 46, `expected better than 46x12, got ${cols}x${rows}`);
  assert.equal(layout.columns, 3);
  assert.ok(layout.fontSize >= 10, "the font trade stays inside legibility");
  assert.ok(layout.fontSize < CELL.fontSize, "a crowded grid is what buys the lines");
});

test("a wider stage buys columns of panes, not wider panes", () => {
  // The old ladder capped at three columns below ten panes however wide the
  // stage, so a large display paid for the extra room with a third row.
  const layout = layoutFor(8, DISPLAY);
  assert.equal(layout.columns, 4);
  assert.equal(layout.rows, 2);
  assert.equal(layout.fontSize, CELL.fontSize, "there is no need to shrink anything here");
  assert.ok(text(layout, DISPLAY).rows >= 20);
});

test("the stage scrolls rather than shave a terminal into a slit", () => {
  const layout = layoutFor(40, LAPTOP);
  assert.equal(layout.scrolls, true);
  assert.ok(text(layout, LAPTOP).rows >= 10, "a scrolled pane is still worth reading");
  assert.equal(layout.paneHeight, layout.minPaneHeight);
});

test("no layout is ever narrower than the wrapping floor", () => {
  for (const metrics of [LAPTOP, DISPLAY, { width: 760, height: 800, ...CELL }]) {
    for (let count = 1; count <= 24; count += 1) {
      const layout = layoutFor(count, metrics);
      const { cols, rows } = text(layout, metrics);
      assert.ok(cols >= 44, `${count} panes at ${metrics.width}px: ${cols} columns`);
      assert.ok(rows >= 10, `${count} panes at ${metrics.width}px: ${rows} rows`);
      assert.ok(layout.fontSize >= 10 && layout.fontSize <= metrics.fontSize);
      assert.ok(layout.columns * layout.rows >= count, "every pane needs a cell");
    }
  }
});

test("a font the user shrank themselves is never quietly grown back", () => {
  const tiny = { width: 1193, height: 872, cellWidth: 5.4, cellHeight: 12, fontSize: 9 };
  for (let count = 1; count <= 12; count += 1) {
    assert.ok(terminalGridLayout(count, tiny).fontSize <= 9, `${count} panes`);
  }
});

test("a stage too small for any readable pane still returns a usable grid", () => {
  const sliver = { width: 200, height: 150, ...CELL };
  const layout = terminalGridLayout(6, sliver);
  assert.equal(layout.columns, 1);
  assert.ok(layout.paneHeight > 0 && layout.minPaneHeight > 0);
});
