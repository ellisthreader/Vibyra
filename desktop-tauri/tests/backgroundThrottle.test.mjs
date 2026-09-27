import assert from "node:assert/strict";
import test from "node:test";

import {
  panesToRestore,
  panesToThrottle,
} from "../src/lib/backgroundThrottlePolicy.ts";

function pane(id, status = "running", visibility = "visible") {
  return { id, status, visibility };
}

test("only on-screen running panes are worth slowing down", () => {
  // Hibernated panes already send nothing and hidden ones are already slow;
  // re-sending for those would be IPC churn for no gain.
  const panes = [
    pane(1),
    pane(2, "running", "hidden"),
    pane(3, "running", "hibernated"),
    pane(4, "exited"),
  ];
  assert.deepEqual(panesToThrottle(panes), [1]);
});

test("a workspace with nothing running throttles nothing", () => {
  assert.deepEqual(panesToThrottle([]), []);
  assert.deepEqual(panesToThrottle([pane(1, "exited")]), []);
});

test("restoring touches only the panes this hook demoted", () => {
  // Pane 9 was hidden by something else entirely; putting it back to visible
  // would override what the user asked for.
  const panes = [pane(1), pane(9)];
  assert.deepEqual(panesToRestore([1], panes), [1]);
  assert.deepEqual(panesToRestore([], panes), []);
});

test("a pane that changed while the window was away is left alone", () => {
  const demoted = [1, 2, 3, 4];
  const panes = [
    pane(1),
    // The user hibernated it, it exited, and it was closed outright.
    pane(2, "running", "hibernated"),
    pane(3, "exited"),
  ];
  assert.deepEqual(panesToRestore(demoted, panes), [1]);
});

test("demote then restore is a round trip for a steady workspace", () => {
  // The property that matters: nothing is stranded on the slow cadence.
  const panes = [pane(1), pane(2), pane(3, "running", "hidden")];
  const demoted = panesToThrottle(panes);
  assert.deepEqual(panesToRestore(demoted, panes), demoted);
});
