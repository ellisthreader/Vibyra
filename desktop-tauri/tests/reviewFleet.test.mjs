import assert from "node:assert/strict";
import test from "node:test";

import { fleetRows, fleetTally } from "../src/lib/reviewFleet.ts";

function pane(id, extra = {}) {
  return {
    id,
    projectId: "proj",
    agentId: "claude",
    title: `pane ${id}`,
    customTitle: null,
    chatTitle: null,
    workspace: { path: `/wt/${id}`, branch: `vibyra/branch-${id}`, baseCommit: "abc" },
    ...extra,
  };
}

function status(files) {
  return {
    changed: Array.from({ length: files }, (_unused, index) => ({
      path: `src/file-${index}.ts`,
      kind: "modified",
      additions: 3,
      deletions: 1,
    })),
    truncated: false,
  };
}

test("the fleet sorts ready, attention, working, idle, then orphaned", () => {
  const rows = fleetRows({
    panes: [pane(1), pane(2), pane(3), pane(4)],
    projectId: "proj",
    statuses: { 1: status(0), 2: status(4), 3: status(2), 4: status(12) },
    activity: { 1: "idle", 2: "working", 3: "attention", 4: "idle" },
    orphans: [{ path: "/wt/dead", branch: "vibyra/left-behind", status: status(6) }],
  });
  assert.deepEqual(
    rows.map((row) => row.status),
    ["ready", "attention", "working", "idle", "orphaned"],
  );
  assert.deepEqual(
    rows.map((row) => row.paneId),
    [4, 3, 2, 1, null],
  );
});

test("ready needs both halves: an idle pane and something to review", () => {
  const rows = fleetRows({
    panes: [pane(1), pane(2)],
    projectId: "proj",
    statuses: { 1: status(0), 2: status(1) },
    activity: { 1: "idle", 2: "idle" },
  });
  assert.equal(rows.find((row) => row.paneId === 1).status, "idle");
  assert.equal(rows.find((row) => row.paneId === 2).status, "ready");
});

test("a pane whose status has never come back is stale and never ready", () => {
  const rows = fleetRows({
    panes: [pane(1), pane(2)],
    projectId: "proj",
    statuses: { 2: status(3) },
    activity: { 1: "idle", 2: "idle" },
  });
  const unfetched = rows.find((row) => row.paneId === 1);
  assert.equal(unfetched.stale, true);
  assert.equal(unfetched.status, "idle");
  assert.deepEqual(unfetched.summary, { files: 0, additions: 0, deletions: 0 });

  const fetched = rows.find((row) => row.paneId === 2);
  assert.equal(fetched.stale, false);
  assert.equal(fetched.status, "ready");
  assert.deepEqual(fetched.summary, { files: 3, additions: 9, deletions: 3 });
});

test("attention outranks ready, because the agent has not finished", () => {
  const rows = fleetRows({
    panes: [pane(1)],
    projectId: "proj",
    statuses: { 1: status(9) },
    activity: { 1: "attention" },
  });
  assert.equal(rows[0].status, "attention");
});

test("only this project's safe-mode panes get a row", () => {
  const rows = fleetRows({
    panes: [
      pane(1),
      pane(2, { projectId: "other" }),
      pane(3, { workspace: null }),
    ],
    projectId: "proj",
    statuses: { 1: status(1), 2: status(1), 3: status(1) },
    activity: {},
  });
  assert.deepEqual(rows.map((row) => row.paneId), [1]);
});

test("rows carry the pane's name and the branch without its prefix", () => {
  const rows = fleetRows({
    panes: [pane(1, { chatTitle: "Wire up auth" })],
    projectId: "proj",
    statuses: { 1: status(2) },
    activity: { 1: "idle" },
  });
  assert.equal(rows[0].branch, "branch-1");
  assert.equal(rows[0].title, "Wire up auth");
  assert.equal(rows[0].agentId, "claude");
  assert.equal(rows[0].key, "pane:1");
});

test("orphans get a row, sort last, and name themselves off the branch", () => {
  const rows = fleetRows({
    panes: [pane(1)],
    projectId: "proj",
    statuses: { 1: status(2) },
    activity: { 1: "idle" },
    orphans: [
      { path: "/wt/b", branch: "vibyra/late", changedAt: 200 },
      { path: "/wt/a", branch: "vibyra/early", status: status(6), changedAt: 100 },
    ],
  });
  const orphans = rows.filter((row) => row.status === "orphaned");
  assert.equal(rows[0].paneId, 1, "a live ready pane still comes first");
  assert.deepEqual(orphans.map((row) => row.branch), ["late", "early"]);
  assert.deepEqual(orphans.map((row) => row.title), ["late", "early"]);
  assert.deepEqual(orphans.map((row) => row.key), ["worktree:/wt/b", "worktree:/wt/a"]);
  // An orphan nobody fetched a status for is stale like any other row.
  assert.equal(orphans[0].stale, true);
  assert.equal(orphans[1].summary.files, 6);
});

test("within a group, most recently changed wins, then pane id, then key", () => {
  const input = {
    panes: [pane(1), pane(2), pane(3)],
    projectId: "proj",
    statuses: { 1: status(1), 2: status(1), 3: status(1) },
    activity: {},
    changedAt: { 1: 50, 2: 900, 3: 50 },
  };
  assert.deepEqual(fleetRows(input).map((row) => row.paneId), [2, 1, 3]);

  // The order is a function of the data alone: a live watcher re-sorts this
  // list on every status that comes back, and rows that compared equal would
  // be free to swap under the user's cursor between aim and click.
  const shuffled = { ...input, panes: [pane(3), pane(1), pane(2)] };
  assert.deepEqual(fleetRows(shuffled).map((row) => row.paneId), [2, 1, 3]);

  const orphaned = fleetRows({
    ...input,
    panes: [],
    orphans: [
      { path: "/wt/b", branch: "vibyra/b" },
      { path: "/wt/a", branch: "vibyra/a" },
    ],
  });
  assert.deepEqual(orphaned.map((row) => row.key), ["worktree:/wt/a", "worktree:/wt/b"]);
});

test("the header summary counts every workspace and only the ready ones", () => {
  const rows = fleetRows({
    panes: [pane(1), pane(2), pane(3), pane(4)],
    projectId: "proj",
    statuses: { 1: status(3), 2: status(5), 3: status(0), 4: status(8) },
    activity: { 1: "idle", 2: "idle", 3: "idle", 4: "working" },
    orphans: [{ path: "/wt/x", branch: "vibyra/x", status: status(2) }],
  });
  assert.deepEqual(fleetTally(rows), { workspaces: 5, ready: 2 });
  // An orphan with changes is housekeeping, not a badge count.
  assert.deepEqual(fleetTally([]), { workspaces: 0, ready: 0 });
});
