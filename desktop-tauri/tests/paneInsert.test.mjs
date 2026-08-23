import assert from "node:assert/strict";
import test from "node:test";

import { insertPane } from "../src/lib/paneInsert.ts";

function pane(id, extra = {}) {
  return {
    id,
    persistenceId: `pane-${id}`,
    projectId: "p1",
    agentId: "shell",
    title: "Terminal",
    status: "running",
    osc: null,
    ...extra,
  };
}

function state(panes, extra = {}) {
  return { panes, focusedId: null, zoomedId: null, activity: {}, ...extra };
}

test("a resumed pane takes the suspended pane's slot instead of appending", () => {
  const before = state([pane(-1), pane(5), pane(-2)]);
  const next = insertPane(before, pane(9), -2);

  assert.deepEqual(next.panes.map((item) => item.id), [-1, 5, 9]);
  assert.equal(next.panes.length, 3, "resume must not add a pane");
  assert.equal(next.focusedId, 9);
});

test("a freshly spawned pane is appended", () => {
  const next = insertPane(state([pane(1)]), pane(2));
  assert.deepEqual(next.panes.map((item) => item.id), [1, 2]);
  assert.equal(next.focusedId, 2);
});

test("replacing a pane inherits its zoom and drops its stale activity", () => {
  const before = state([pane(-1)], { zoomedId: -1, activity: { [-1]: "attention" } });
  const next = insertPane(before, pane(4), -1);
  assert.equal(next.zoomedId, 4, "zoom should follow the resumed pane");
  assert.equal(next.activity[-1], undefined, "activity for the old id must be cleared");
});

test("a vanished replacement target never focuses an orphan terminal", () => {
  const before = state([pane(1)], { focusedId: 1 });
  assert.deepEqual(insertPane(before, pane(8), -1), {});
});
