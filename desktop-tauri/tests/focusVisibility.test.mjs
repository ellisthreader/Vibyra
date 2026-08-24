import assert from "node:assert/strict";
import test from "node:test";

import {
  paneVisibilityTarget,
  syncFocusVisibility,
  syncProjectVisibility,
} from "../src/lib/projectTransitions.ts";

function pane(id, overrides = {}) {
  return {
    id,
    projectId: "p1",
    status: "running",
    visibility: "background",
    ...overrides,
  };
}

test("only the focused pane earns the full native flush rate", () => {
  const panes = [pane(1), pane(2), pane(3)];
  const targets = panes.map((p) => paneVisibilityTarget(p, "p1", 2));
  assert.deepEqual(targets, ["background", "visible", "background"]);
});

test("a grid with no focus costs nothing extra", () => {
  // Nothing is being typed into, so no pane needs 16 ms delivery.
  assert.equal(paneVisibilityTarget(pane(1), "p1", null), "background");
});

test("panes outside the active project still hibernate", () => {
  assert.equal(paneVisibilityTarget(pane(1, { projectId: "other" }), "p1", 1), "hidden");
});

test("panes with nothing to assert are skipped", () => {
  assert.equal(paneVisibilityTarget(pane(1, { status: "exited" }), "p1", 1), null);
  assert.equal(paneVisibilityTarget(pane(1, { visibility: "hibernated" }), "p1", 1), null);
});

test("focus changes send only the two panes that changed", async () => {
  // The regression this guards: reasserting the whole grid on every click
  // spends a round trip per pane, which is the cost we are removing.
  const panes = [
    pane(1, { visibility: "visible" }),
    pane(2),
    pane(3),
    pane(4),
  ];
  const calls = [];
  const applied = await syncFocusVisibility(panes, "p1", 3, async (id, visibility) => {
    calls.push([id, visibility]);
  });
  assert.deepEqual(calls.sort(), [
    [1, "background"],
    [3, "visible"],
  ]);
  assert.equal(applied.size, 2);
});

test("a focus change that alters nothing sends no IPC at all", async () => {
  const panes = [pane(1, { visibility: "visible" }), pane(2)];
  const calls = [];
  await syncFocusVisibility(panes, "p1", 1, async (id, visibility) => {
    calls.push([id, visibility]);
  });
  assert.deepEqual(calls, []);
});

test("a failed native update stays retryable", async () => {
  const panes = [pane(1), pane(2)];
  const applied = await syncFocusVisibility(panes, "p1", 1, async (id) => {
    if (id === 1) throw new Error("ipc down");
  });
  assert.equal(applied.has(1), false);
});

test("project sync keeps the focused pane at the full rate", async () => {
  const panes = [pane(1), pane(2)];
  const seen = new Map();
  await syncProjectVisibility(
    panes,
    "p1",
    async (id, visibility) => {
      seen.set(id, visibility);
    },
    2,
  );
  assert.equal(seen.get(1), "background");
  assert.equal(seen.get(2), "visible");
});
