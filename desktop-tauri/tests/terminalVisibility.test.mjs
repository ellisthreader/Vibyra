import assert from "node:assert/strict";
import test from "node:test";

import { nativeTerminalVisibility } from "../src/lib/terminalVisibility.ts";

test("off-screen terminals stop native delivery until their resync", () => {
  assert.equal(nativeTerminalVisibility("visible"), "visible");
  assert.equal(nativeTerminalVisibility("hidden"), "hibernated");
  assert.equal(nativeTerminalVisibility("hibernated"), "hibernated");
});

test("background panes stay on screen rather than hibernating", () => {
  // They are still painting, just paced. Collapsing them into "hibernated"
  // would freeze every unfocused pane in the grid.
  assert.equal(nativeTerminalVisibility("background"), "background");
});

test("releasing a zoom restores the focus-paced grid, not an all-visible one", async () => {
  const { zoomVisibilityTarget } = await import("../src/lib/projectTransitions.ts");
  const pane = (id, visibility = "visible") => ({
    id, projectId: "p1", status: "running", visibility,
  });
  // Zoom held: the zoomed pane renders, the rest stop entirely.
  assert.equal(zoomVisibilityTarget(pane(1), "p1", 1, 1), "visible");
  assert.equal(zoomVisibilityTarget(pane(2, "hidden"), "p1", 1, 1), "hidden");
  // Zoom released with focus unchanged: only the focused pane gets the full
  // rate — this is the case the focus effect cannot cover, because focus
  // did not change and its effect will not re-run.
  assert.equal(zoomVisibilityTarget(pane(1, "hidden"), "p1", null, 1), "visible");
  assert.equal(zoomVisibilityTarget(pane(2, "hidden"), "p1", null, 1), "background");
  // Other projects and non-running panes are never touched.
  assert.equal(zoomVisibilityTarget({ ...pane(3), projectId: "p2" }, "p1", null, 1), null);
  assert.equal(zoomVisibilityTarget({ ...pane(4), status: "exited" }, "p1", null, 1), null);
});
