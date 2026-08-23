import assert from "node:assert/strict";
import test from "node:test";

import { exitNotification } from "../src/lib/sessionExitNotifications.ts";

function pane(overrides = {}) {
  return {
    id: 7,
    projectId: "p1",
    agentId: "claude",
    title: "Claude Code",
    customTitle: null,
    chatTitle: null,
    osc: null,
    status: "running",
    ...overrides,
  };
}

test("a clean exit reads as a finished run", () => {
  const notice = exitNotification(pane(), 0, false);
  assert.equal(notice.category, "agentDone");
  assert.equal(notice.severity, "success");
  assert.equal(notice.title, "Claude Code finished");
  assert.equal(notice.action.arg, 7);
});

test("completions share a dedupe key so a burst collapses into one line", () => {
  const first = exitNotification(pane({ id: 1 }), 0, false);
  const second = exitNotification(pane({ id: 2 }), 0, false);
  assert.equal(first.dedupeKey, second.dedupeKey);
});

test("failures get their own row, and stay until dismissed", () => {
  const notice = exitNotification(pane(), 1, false);
  assert.equal(notice.category, "agentFailed");
  assert.equal(notice.severity, "danger");
  assert.equal(notice.timeoutMs, 0);
  assert.match(notice.title, /code 1/);
  assert.notEqual(exitNotification(pane({ id: 8 }), 1, false).dedupeKey, notice.dedupeKey);
});

test("a killed process says nothing", () => {
  // A null code means closed, hibernated, or torn down by a restart.
  assert.equal(exitNotification(pane(), null, false), null);
});

test("a deliberate teardown says nothing", () => {
  assert.equal(exitNotification(pane(), 0, true), null);
  assert.equal(exitNotification(pane(), 1, true), null);
});

test("the user's own shell exiting is not news", () => {
  assert.equal(exitNotification(pane({ agentId: "shell" }), 0, false), null);
  assert.equal(exitNotification(pane({ agentId: "ssh" }), 130, false), null);
});

test("a renamed pane is announced by the name the user gave it", () => {
  const notice = exitNotification(pane({ customTitle: "Deploy run" }), 0, false);
  assert.equal(notice.title, "Deploy run finished");
});

test("a prompt-derived chat name beats a generic OSC title", () => {
  const notice = exitNotification(
    pane({ chatTitle: "Fix terminal titles", osc: "Vibyra" }),
    0,
    false,
  );
  assert.equal(notice.title, "Fix terminal titles finished");
});

test("an unknown pane is skipped rather than guessed at", () => {
  assert.equal(exitNotification(undefined, 0, false), null);
});
