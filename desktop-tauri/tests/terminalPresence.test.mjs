import assert from "node:assert/strict";
import test from "node:test";

import { terminalsOnScreen } from "../src/lib/terminalPresence.ts";

test("leaving Code Mode takes the terminals off screen at every dock size", () => {
  // The regression this exists for: Agent and Chat Mode hide Code Mode with
  // `display: none`, but the native flush budget was computed from the dock
  // alone. Every pane kept its on-screen delivery rate — up to the 16 ms tick
  // — writing into canvases nobody could see, for as long as the user stayed
  // out of Code Mode.
  for (const mode of ["agent", "chat"]) {
    assert.equal(terminalsOnScreen(mode, "compact", true), false);
    assert.equal(terminalsOnScreen(mode, "wide", true), false);
    assert.equal(terminalsOnScreen(mode, "full", true), false);
    assert.equal(terminalsOnScreen(mode, "compact", false), false);
  }
});

test("Code Mode still defers to the dock rule", () => {
  // Being in the right mode is necessary, not sufficient: a full-size dock
  // covers the grid just as completely as another mode does.
  assert.equal(terminalsOnScreen("code", "compact", true), true);
  assert.equal(terminalsOnScreen("code", "wide", true), true);
  assert.equal(terminalsOnScreen("code", "full", true), false);
  assert.equal(terminalsOnScreen("code", "full", false), true);
});
