import assert from "node:assert/strict";
import test from "node:test";

import {
  collisionNotice,
  fleetSignature,
  readyNotice,
} from "../src/lib/reviewNotifications.ts";

function row(overrides = {}) {
  return {
    key: "pane:3",
    paneId: 3,
    branch: "vibyra-abc-0",
    agentId: "claude",
    title: "Claude",
    summary: { files: 12, additions: 340, deletions: 22 },
    status: "ready",
    stale: false,
    changedAt: 10,
    ...overrides,
  };
}

function party(paneId, label, landed = false) {
  return { key: `pane:${paneId}`, paneId, label, landed };
}

function collision(level, overrides = {}) {
  return {
    path: "src/lib/dockLayout.ts",
    level,
    workspaces: [party(3, "Claude #3"), party(5, "Codex #5")],
    ...overrides,
  };
}

test("a finished workspace announces once, keyed so it replaces itself", () => {
  const notice = readyNotice(row());
  assert.equal(notice.kind, "agent");
  assert.equal(notice.tier, "done");
  assert.match(notice.title, /Claude/);
  assert.match(notice.body, /12 files/);
  assert.match(notice.body, /\+340/);
  // Replace, not dedupe: one card per workspace as its tally grows, rather
  // than a column of stale ones.
  assert.equal(notice.replaceKey, "review:ready:3");
  assert.equal(notice.action.arg, 3);
});

test("only a ready row announces", () => {
  for (const status of ["working", "attention", "idle", "orphaned"]) {
    assert.equal(readyNotice(row({ status })), null, status);
  }
});

test("an orphan never announces — there is no terminal to send anyone to", () => {
  assert.equal(readyNotice(row({ paneId: null, status: "orphaned" })), null);
});

test("one file reads as one file", () => {
  const notice = readyNotice(row({ summary: { files: 1, additions: 3, deletions: 0 } }));
  assert.match(notice.body, /^1 file /);
});

test("touch never interrupts", () => {
  // The rule the whole radar stands on: two agents editing different
  // functions in one file is normal, and announcing it teaches the user to
  // ignore the feature.
  assert.equal(collisionNotice(collision("touch")), null);
});

test("overlap warns while both agents are still running", () => {
  const notice = collisionNotice(collision("overlap"));
  assert.equal(notice.kind, "app");
  assert.equal(notice.tier, "risk");
  assert.match(notice.title, /dockLayout\.ts/);
  assert.match(notice.body, /Claude #3 and Codex #5/);
  assert.equal(notice.osEligible, false);
  assert.equal(notice.replaceKey, "review:collision:src/lib/dockLayout.ts");
});

test("conflict says the patch will not apply, not merely that it might", () => {
  const notice = collisionNotice(
    collision("conflict", { workspaces: [party(3, "Claude #3", true), party(5, "Codex #5")] }),
  );
  assert.match(notice.title, /already landed/);
  assert.match(notice.body, /will not apply cleanly/);
});

test("the signature is stable when nothing changed and moves when it did", () => {
  const rows = [row()];
  const found = [collision("overlap")];
  assert.equal(fleetSignature(rows, found), fleetSignature(rows, found));

  // A re-read at the same tally must not re-announce.
  assert.equal(fleetSignature(rows, found), fleetSignature([row({ changedAt: 99 })], found));

  // A grown changeset must.
  const grown = [row({ summary: { files: 13, additions: 350, deletions: 22 } })];
  assert.notEqual(fleetSignature(rows, found), fleetSignature(grown, found));

  // A touch appearing must not, an overlap must.
  assert.equal(fleetSignature(rows, []), fleetSignature(rows, [collision("touch")]));
  assert.notEqual(fleetSignature(rows, []), fleetSignature(rows, [collision("overlap")]));
});

test("only ready rows reach the signature", () => {
  const working = [row({ status: "working" })];
  assert.equal(fleetSignature(working, []), fleetSignature([], []));
});
