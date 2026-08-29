import assert from "node:assert/strict";
import test from "node:test";

import {
  blockedKeys,
  canLandInline,
  contestedKeys,
  landReport,
  landableRows,
  radarCollisions,
} from "../src/lib/reviewFleetActionPolicy.ts";

// The Fleet level's two decisions: which rows may be landed in one click, and
// what a land-all run is allowed to claim afterwards. Both are pinned here
// rather than discovered in the panel, because both are promises to the user —
// one that the radar means something, one that the tally is honest.

function row(over = {}) {
  const paneId = over.paneId === undefined ? 1 : over.paneId;
  return {
    key: paneId === null ? "worktree:/tmp/w" : `pane:${paneId}`,
    paneId,
    branch: "feat-auth",
    agentId: "claude",
    title: "claude",
    summary: { files: 3, additions: 10, deletions: 2 },
    status: "ready",
    stale: false,
    changedAt: 0,
    ...over,
  };
}

function collision(path, level, paneIds) {
  return {
    path,
    level,
    workspaces: paneIds.map((id) => ({
      key: `pane:${id}`,
      paneId: id,
      label: `claude #${id}`,
      landed: false,
    })),
  };
}

test("a touch never reaches the radar and never withholds a land", () => {
  // Two agents editing different functions of one file is the normal shape of
  // parallel work. Showing it is how a radar becomes noise, and blocking on it
  // is how the safe case starts feeling unsafe.
  const found = [collision("src/lib/dockLayout.ts", "touch", [3, 5])];

  assert.deepEqual(radarCollisions(found), []);
  assert.deepEqual([...blockedKeys(found)], []);
  assert.ok(canLandInline(row({ paneId: 3 }), blockedKeys(found).has("pane:3")));
});

test("a touch still earns the quiet pip on both rows", () => {
  const found = [collision("src/lib/dockLayout.ts", "touch", [3, 5])];
  assert.deepEqual([...contestedKeys(found)].sort(), ["pane:3", "pane:5"]);
});

test("an unresolved overlap takes the one-click Land off every party", () => {
  const found = [collision("src/lib/dockLayout.ts", "overlap", [3, 5])];
  const blocked = blockedKeys(found);

  assert.equal(radarCollisions(found).length, 1);
  assert.equal(canLandInline(row({ paneId: 3 }), blocked.has("pane:3")), false);
  assert.equal(canLandInline(row({ paneId: 5 }), blocked.has("pane:5")), false);
  // An uninvolved workspace keeps its Land: the radar narrows the fleet, it
  // does not freeze it.
  assert.ok(canLandInline(row({ paneId: 9 }), blocked.has("pane:9")));
});

test("a conflict blocks the same way an overlap does", () => {
  const found = [collision("src/state/reviewStore.ts", "conflict", [3, 5])];
  assert.equal(canLandInline(row({ paneId: 3 }), blockedKeys(found).has("pane:3")), false);
});

test("only a ready row with a terminal can be landed", () => {
  assert.equal(canLandInline(row({ status: "working" }), false), false);
  assert.equal(canLandInline(row({ status: "idle" }), false), false);
  assert.equal(canLandInline(row({ paneId: null, status: "orphaned" }), false), false);
});

test("land-all targets skip orphans, whose panes are gone", () => {
  const rows = [
    row({ paneId: 3 }),
    row({ paneId: 5, status: "working" }),
    row({ paneId: null, status: "orphaned" }),
  ];
  assert.deepEqual(landableRows(rows).map((entry) => entry.paneId), [3]);
});

test("a clean run says only what it did", () => {
  const report = landReport([
    { key: "pane:3", paneId: 3, label: "claude #3", applied: true },
    { key: "pane:5", paneId: 5, label: "codex #5", applied: true },
  ]);
  assert.deepEqual(report.stuck, []);
  assert.equal(report.text, "Approved 2");
});

test("a mixed run names what bounced and keeps it linkable", () => {
  const report = landReport([
    { key: "pane:3", paneId: 3, label: "claude #3", applied: true },
    { key: "pane:5", paneId: 5, label: "codex #5", applied: true },
    { key: "pane:7", paneId: 7, label: "gemini #7", applied: true },
    { key: "pane:9", paneId: 9, label: "claude #9", applied: false },
  ]);
  assert.equal(report.landed, 3);
  assert.equal(report.text, "Approved 3 · 1 needs attention");
  assert.deepEqual(report.stuck.map((entry) => entry.paneId), [9]);
});

test("a run that lands nothing never reports a landing", () => {
  const report = landReport([
    { key: "pane:3", paneId: 3, label: "claude #3", applied: false },
    { key: "pane:5", paneId: 5, label: "codex #5", applied: false },
  ]);
  assert.equal(report.landed, 0);
  assert.equal(report.text, "Nothing went in · 2 need attention");
});
