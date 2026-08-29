import assert from "node:assert/strict";
import test from "node:test";

import { deriveFleet, rowLabel } from "../src/lib/reviewDerive.ts";
import { fleetTally } from "../src/lib/reviewFleet.ts";

function pane(id, title, path) {
  return {
    id,
    projectId: "p1",
    agentId: "claude",
    title,
    customTitle: null,
    chatTitle: null,
    workspace: { path, branch: `vibyra/proj-${id}`, baseCommit: "abc" },
  };
}

function status(...files) {
  return {
    changed: files.map(([path, kind = "modified"]) => ({
      path,
      kind,
      additions: 5,
      deletions: 1,
    })),
    truncated: false,
  };
}

function slice(overrides = {}) {
  return {
    panes: [pane(3, "Claude", "/w/3"), pane(5, "Codex", "/w/5")],
    projectId: "p1",
    statuses: { 3: status(["a.ts"]), 5: status(["a.ts"]) },
    activity: { 3: "idle", 5: "idle" },
    changedAt: { 3: 20, 5: 10 },
    ranges: {},
    orphans: [],
    landed: [],
    ...overrides,
  };
}

test("two idle workspaces with changes are both ready, newest first", () => {
  const { rows } = deriveFleet(slice());
  assert.deepEqual(rows.map((row) => row.paneId), [3, 5]);
  assert.equal(rows.every((row) => row.status === "ready"), true);
  assert.deepEqual(fleetTally(rows), { workspaces: 2, ready: 2 });
});

test("a shared path with no ranges read yet is a touch, and stays silent", () => {
  // Ranges are fetched only for contested paths, so the first derivation
  // after a refresh legitimately has none. Reporting an overlap it cannot
  // substantiate is exactly the cry-wolf failure the radar must not have.
  const { found } = deriveFleet(slice());
  assert.equal(found.length, 1);
  assert.equal(found[0].path, "a.ts");
  assert.equal(found[0].level, "touch");
});

test("overlapping ranges on a shared path raise an overlap", () => {
  const { found } = deriveFleet(
    slice({ ranges: { 3: { "a.ts": [{ start: 10, end: 20 }] }, 5: { "a.ts": [{ start: 18, end: 25 }] } } }),
  );
  assert.equal(found[0].level, "overlap");
  assert.deepEqual(found[0].workspaces.map((w) => w.paneId), [3, 5]);
});

test("far-apart ranges on a shared path stay a touch", () => {
  const { found } = deriveFleet(
    slice({ ranges: { 3: { "a.ts": [{ start: 1, end: 5 }] }, 5: { "a.ts": [{ start: 400, end: 410 }] } } }),
  );
  assert.equal(found[0].level, "touch");
});

test("an overlap against something already landed becomes a conflict", () => {
  const { found } = deriveFleet(
    slice({
      landed: [3],
      ranges: { 3: { "a.ts": [{ start: 10, end: 20 }] }, 5: { "a.ts": [{ start: 18, end: 25 }] } },
    }),
  );
  assert.equal(found[0].level, "conflict");
});

test("disjoint changesets collide over nothing", () => {
  const { found } = deriveFleet(
    slice({ statuses: { 3: status(["a.ts"]), 5: status(["b.ts"]) } }),
  );
  assert.deepEqual(found, []);
});

test("a working pane is not ready however much it has changed", () => {
  const { rows } = deriveFleet(slice({ activity: { 3: "working", 5: "idle" } }));
  const busy = rows.find((row) => row.paneId === 3);
  assert.equal(busy.status, "working");
  assert.equal(fleetTally(rows).ready, 1);
});

test("a pane whose status never came back is stale, not ready", () => {
  const { rows } = deriveFleet(slice({ statuses: { 5: status(["a.ts"]) } }));
  const unknown = rows.find((row) => row.paneId === 3);
  assert.equal(unknown.stale, true);
  assert.notEqual(unknown.status, "ready");
});

test("a worktree no pane owns appears as an orphan and sorts last", () => {
  const { rows } = deriveFleet(
    slice({ orphans: [{ path: "/w/9", branch: "vibyra/proj-9", head: "d", locked: false, exists: true }] }),
  );
  assert.equal(rows.length, 3);
  assert.equal(rows[rows.length - 1].status, "orphaned");
  assert.equal(rows[rows.length - 1].paneId, null);
});

test("a worktree a live pane owns is never listed twice", () => {
  const { rows } = deriveFleet(
    slice({ orphans: [{ path: "/w/3", branch: "vibyra/proj-3", head: "d", locked: false, exists: true }] }),
  );
  assert.equal(rows.length, 2);
  assert.equal(rows.some((row) => row.paneId === null), false);
});

test("a row names itself the way the pane header does", () => {
  const { rows } = deriveFleet(slice());
  assert.equal(rowLabel(rows.find((row) => row.paneId === 3)), "Claude #3");
  const { rows: withOrphan } = deriveFleet(
    slice({ orphans: [{ path: "/w/9", branch: "vibyra/proj-9", head: "d", locked: false, exists: true }] }),
  );
  const orphan = withOrphan.find((row) => row.paneId === null);
  assert.equal(rowLabel(orphan), orphan.branch);
});

test("the derivation is a function of its input alone", () => {
  const first = deriveFleet(slice());
  const second = deriveFleet(slice());
  assert.deepEqual(
    first.rows.map((row) => row.key),
    second.rows.map((row) => row.key),
  );
  assert.deepEqual(first.found, second.found);
});
