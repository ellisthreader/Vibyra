import assert from "node:assert/strict";
import test from "node:test";

import { fleetRows } from "../src/lib/reviewFleet.ts";
import { leftoverSummary, splitFleet } from "../src/lib/reviewLeftovers.ts";

// The fleet answers one question — who is done — and a leftover worktree can
// never be an answer to it. This machine had forty of them against three live
// agents, all rendered inline as full rows, so the question went unanswered
// under a wall of housekeeping.

const pane = (id, branch) => ({
  id,
  agentId: "codex",
  title: `agent ${id}`,
  status: "running",
  workspace: { path: `/w/${branch}`, branch: `vibyra/${branch}`, baseCommit: "abc" },
  projectId: "p1",
  mode: "safe",
});

const orphan = (branch) => ({ path: `/w/${branch}`, branch: `vibyra/${branch}` });

test("leftovers come out of the list the panel is read from", () => {
  const rows = fleetRows({
    panes: [pane(1, "live-a"), pane(2, "live-b")],
    projectId: "p1",
    statuses: {},
    activity: {},
    orphans: [orphan("gone-a"), orphan("gone-b"), orphan("gone-c")],
  });
  const { live, leftovers } = splitFleet(rows);

  assert.equal(live.length, 2);
  assert.equal(leftovers.length, 3);
  assert.ok(live.every((row) => row.paneId !== null));
  assert.ok(leftovers.every((row) => row.paneId === null));
});

test("every row lands on exactly one side of the split", () => {
  const rows = fleetRows({
    panes: [pane(1, "a")],
    projectId: "p1",
    statuses: {},
    activity: {},
    orphans: [orphan("b")],
  });
  const { live, leftovers } = splitFleet(rows);
  assert.equal(live.length + leftovers.length, rows.length);
  const keys = new Set([...live, ...leftovers].map((row) => row.key));
  assert.equal(keys.size, rows.length);
});

test("the split keeps the fleet's ranking within each side", () => {
  const rows = fleetRows({
    panes: [pane(1, "a"), pane(2, "b")],
    projectId: "p1",
    statuses: {},
    activity: { 1: "idle", 2: "attention" },
    orphans: [orphan("x")],
  });
  const { live } = splitFleet(rows);
  // `attention` outranks `idle`, exactly as it does in the unsplit list.
  assert.equal(live[0].paneId, 2);
});

test("a fleet with nothing left over produces an empty group", () => {
  const rows = fleetRows({ panes: [pane(1, "a")], projectId: "p1", statuses: {}, activity: {} });
  assert.deepEqual(splitFleet(rows).leftovers, []);
});

test("the summary counts in words a person would use, and gets one right", () => {
  assert.equal(leftoverSummary(1), "1 leftover copy");
  assert.equal(leftoverSummary(3), "3 leftover copies");
  assert.equal(leftoverSummary(40), "40 leftover copies");
});
