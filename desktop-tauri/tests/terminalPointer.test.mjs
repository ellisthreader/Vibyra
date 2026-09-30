import assert from "node:assert/strict";
import test from "node:test";

import {
  pointerMissedTerminal,
  terminalWheelLines,
} from "../src/lib/terminalPointer.ts";
import {
  terminalBottomAnchorPixels,
  terminalBottomAnchorRows,
} from "../src/lib/terminalBottomAnchor.ts";

/** A Node whose `contains` answers for a fixed set of descendants. */
function mockElement(descendants) {
  return { contains: (node) => descendants.includes(node) };
}

class FakeNode {}
// `pointerMissedTerminal` narrows with `instanceof Node`, which node: does not
// define; the test supplies one so the browser check has something to answer.
globalThis.Node = FakeNode;

test("a click on the terminal is left to xterm", () => {
  const row = new FakeNode();
  assert.equal(pointerMissedTerminal(mockElement([row]), row), false);
});

test("a click on the pane around the terminal is forwarded", () => {
  const stray = new FakeNode();
  assert.equal(pointerMissedTerminal(mockElement([]), stray), true);
});

test("a click with no element target is forwarded", () => {
  assert.equal(pointerMissedTerminal(mockElement([]), null), true);
});

test("an unmounted terminal forwards nothing", () => {
  assert.equal(pointerMissedTerminal(null, new FakeNode()), false);
});

test("pixel wheel deltas convert to rows at the rendered row height", () => {
  assert.equal(terminalWheelLines(45, 0, 15), 3);
  assert.equal(terminalWheelLines(-45, 0, 15), -3);
});

test("line wheel deltas already count rows", () => {
  assert.equal(terminalWheelLines(3, 1, 15), 3);
});

test("a delta below one row still moves a row rather than nothing", () => {
  assert.equal(terminalWheelLines(4, 0, 15), 1);
  assert.equal(terminalWheelLines(-4, 0, 15), -1);
});

test("a wheel before the first fit falls back to an assumed row height", () => {
  assert.equal(terminalWheelLines(45, 0, 0), 3);
});

/*
 * The regression this file exists for. Codex's "Update available!" prompt
 * draws ten rows and parks the cursor on the last one, so the anchor pushes
 * the terminal three quarters of the way down its own pane. Everything above
 * it belongs to the host div, and before the forwarding the pane took the
 * click, lit its focus ring and swallowed every keystroke after it.
 */
test("a short provider prompt leaves most of the pane off the terminal", () => {
  const rows = 42;
  const term = {
    rows,
    buffer: {
      active: {
        baseY: 0,
        viewportY: 0,
        cursorY: 9,
        getLine: (index) =>
          index < 10 ? { translateToString: () => "prompt" } : { translateToString: () => "" },
      },
    },
  };
  const blankRows = terminalBottomAnchorRows(term);
  assert.equal(blankRows, 32);

  const cellHeight = 15;
  const offset = terminalBottomAnchorPixels(blankRows, cellHeight);
  assert.equal(offset, 480);
  // The pane is 42 rows tall; the terminal now starts 32 of them down, so a
  // click anywhere in that band has to be forwarded by hand.
  assert.ok(offset > (rows * cellHeight) / 2);
  assert.equal(pointerMissedTerminal(mockElement([]), new FakeNode()), true);
});
