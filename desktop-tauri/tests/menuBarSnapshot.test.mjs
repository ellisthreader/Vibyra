import assert from "node:assert/strict";
import test from "node:test";

import { buildMenuBarSnapshot, RECENT_WINDOW_MS } from "../src/lib/menuBarSnapshot.ts";

const NOW = 10_000_000;

function pane(id, extra = {}) {
  return { id, projectId: "p1", status: "running", visibility: "visible", title: `zsh ${id}`, ...extra };
}

function input(extra = {}) {
  return {
    enabled: true,
    panes: [],
    activity: {},
    chats: {},
    teammates: [],
    phones: 0,
    projects: [{ id: "p1", name: "Vibyra" }],
    history: [],
    now: NOW,
    ...extra,
  };
}

function done(id, at, category = "agentDone") {
  return { id: at, at, count: 1, read: false, category, severity: "success", title: `Run ${id} finished`, action: { id: "focusSession", label: "Open terminal", arg: id } };
}

test("waiting and working terminals are split, with their project and best title", () => {
  const snap = buildMenuBarSnapshot(input({
    panes: [pane(1, { customTitle: "Fix login" }), pane(2, { autoTitle: "Tests" }), pane(3)],
    activity: { 1: "attention", 2: "working", 3: "idle" },
  }));
  assert.deepEqual(snap.attention, [{ key: "t:1", title: "Fix login", project: "Vibyra", agent: "" }]);
  assert.deepEqual(snap.working, [{ key: "t:2", title: "Tests", project: "Vibyra", agent: "" }]);
});

test("exited and hibernated panes never show as live", () => {
  const snap = buildMenuBarSnapshot(input({
    panes: [pane(1, { status: "exited" }), pane(2, { visibility: "hibernated" })],
    activity: { 1: "working", 2: "attention" },
  }));
  assert.equal(snap.attention.length + snap.working.length, 0);
});

test("chats, teammates and iPhones count as needing you; chat titles are never the prompt", () => {
  const run = (state) => ({ state, ask: "secret prompt text", step: null, found: null, steps: 0, commands: 0, startedAt: 1, finishedAt: null, durationMs: null });
  const snap = buildMenuBarSnapshot(input({
    chats: { "abc-1": { projectId: "p1", agentId: "claude", title: "Refactor", run: run("waiting") }, "abc-2": { projectId: "p1", agentId: "codex", title: "", run: run("working") } },
    teammates: [{ id: "n1", title: "Approval needed", createdAt: "", read: false, actionable: true, destination: { source: "agent_run", agentId: "mate-7", kind: "approval" } }],
    phones: 2,
  }));
  assert.deepEqual(snap.attention.map((row) => row.key), ["c:abc-1", "m:mate-7", "phone"]);
  assert.equal(snap.attention[0].title, "Refactor");
  assert.equal(snap.attention[2].title, "2 iPhones want to connect");
  assert.deepEqual(snap.working, [{ key: "c:abc-2", title: "Agent chat", project: "Vibyra", agent: "codex" }]);
  assert.ok(!JSON.stringify(snap).includes("secret prompt text"));
});

test("recent keeps the newest three finished or failed runs within the hour", () => {
  const history = [done(1, NOW - 1000), done(2, NOW - 2000, "agentFailed"), done(1, NOW - 3000), done(3, NOW - 4000), done(4, NOW - 5000), done(5, NOW - RECENT_WINDOW_MS - 1)];
  const snap = buildMenuBarSnapshot(input({ panes: [pane(1, { customTitle: "Build" })], history }));
  assert.deepEqual(snap.recent, [
    { key: "t:1", title: "Build", agent: "", outcome: "done" },
    { key: "t:2", title: "Run 2 finished", agent: "", outcome: "failed" },
    { key: "t:3", title: "Run 3 finished", agent: "", outcome: "done" },
  ]);
});

test("a run that is busy again leaves Recent", () => {
  const snap = buildMenuBarSnapshot(input({ panes: [pane(1)], activity: { 1: "working" }, history: [done(1, NOW - 10)] }));
  assert.equal(snap.recent.length, 0);
});

test("switched off sends one empty, disabled snapshot", () => {
  const snap = buildMenuBarSnapshot(input({ enabled: false, panes: [pane(1)], activity: { 1: "attention" } }));
  assert.deepEqual(snap, { enabled: false, attention: [], working: [], recent: [] });
});
