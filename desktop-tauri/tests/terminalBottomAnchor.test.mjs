import assert from "node:assert/strict";
import test from "node:test";

import {
  terminalBottomAnchorPixels,
  terminalBottomAnchorRows,
  terminalViewportIsNearBottom,
} from "../src/lib/terminalBottomAnchor.ts";

function mockTerminal({ rows = 8, lines = [], cursorY = 0, baseY = 0, viewportY = 0 }) {
  return {
    rows,
    buffer: {
      active: {
        baseY,
        viewportY,
        cursorY,
        getLine(index) {
          const value = lines[index - viewportY];
          return value === undefined
            ? undefined
            : { translateToString: () => value };
        },
      },
    },
  };
}

test("anchors the final provider content row to the pane bottom", () => {
  const term = mockTerminal({ lines: ["provider", "❯ prompt"], cursorY: 1 });
  assert.equal(terminalBottomAnchorRows(term), 6);
});

test("treats a blank cursor row as the active typing row", () => {
  const term = mockTerminal({ lines: ["response"], cursorY: 3 });
  assert.equal(terminalBottomAnchorRows(term), 4);
});

test("does not shift a provider that already owns the final row", () => {
  const term = mockTerminal({ lines: ["", "", "", "", "", "", "", "status"], cursorY: 7 });
  assert.equal(terminalBottomAnchorRows(term), 0);
});

test("preserves manual scrollback outside the near-bottom threshold", () => {
  assert.equal(terminalViewportIsNearBottom(mockTerminal({ baseY: 50, viewportY: 47 })), false);
  assert.equal(terminalViewportIsNearBottom(mockTerminal({ baseY: 50, viewportY: 48 })), true);
});

test("uses the rendered cell height for fractional bottom placement", () => {
  assert.equal(terminalBottomAnchorPixels(3, 15.25), 45.75);
  assert.equal(terminalBottomAnchorPixels(3, 0), 0);
});
