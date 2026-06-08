import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const source = readFileSync(
  new URL("./app.terminals-pty-runtime.js", import.meta.url),
  "utf8",
);

function sourceBetween(start, end) {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from);
  assert.notEqual(from, -1, `Missing source anchor: ${start}`);
  assert.notEqual(to, -1, `Missing source anchor: ${end}`);
  return source.slice(from, to);
}

test("provider readiness is normalized from authoritative session state", () => {
  const context = {
    normalizeTerminalEffort: String,
    normalizeTerminalPermissionMode: String,
    normalizeTerminalWorkspaceMode: String,
  };
  vm.runInNewContext(
    sourceBetween("function ptySessionPatch", "function agentButton"),
    context,
  );

  const starting = context.ptySessionPatch({
    status: "running",
    providerState: "starting",
  });
  assert.equal(starting.providerState, "starting");
  assert.equal(starting.providerReady, false);
  assert.equal(starting.providerBusy, false);

  const busy = context.ptySessionPatch({
    status: "running",
    providerState: { state: "busy", ready: true, busy: true },
  });
  assert.equal(busy.providerState, "busy");
  assert.equal(busy.providerReady, true);
  assert.equal(busy.providerBusy, true);

  const fallback = context.ptySessionPatch({
    status: "running",
    providerState: "fallback_shell",
  });
  assert.equal(fallback.providerState, "fallback-shell");
  assert.equal(fallback.providerReady, false);
});

test("reconciliation preserves transient assignment activity and delivery errors", () => {
  const activity = { assignmentId: "assignment-1", phase: "accepted" };
  const terminal = {
    id: "one",
    title: "One",
    notice: "The task could not be delivered.",
    taskActivity: activity,
    ptyStatus: "running",
  };
  const context = {
    Date,
    maxTerminals: 12,
    terminals: [terminal],
    normalizeTerminal: (value) => value,
    normalizeTerminalEffort: String,
    normalizeTerminalPermissionMode: String,
    normalizeTerminalWorkspaceMode: String,
    connectPtyTerminal: () => {},
    removeLocalPtyTerminal: () => {},
  };
  vm.runInNewContext(
    [
      sourceBetween("function ptySessionPatch", "function agentButton"),
      sourceBetween("function reconcilePtyTerminalSessions", "function removeLocalPtyTerminal"),
    ].join("\n"),
    context,
  );

  context.reconcilePtyTerminalSessions([{
    id: "one",
    title: "Recovered One",
    status: "running",
    providerState: "ready",
  }]);

  assert.equal(context.terminals[0], terminal);
  assert.equal(terminal.taskActivity, activity);
  assert.equal(terminal.notice, "The task could not be delivered.");
  assert.equal(terminal.providerReady, true);
});

test("collection sync calls share one in-flight request", async () => {
  let resolveSync;
  let calls = 0;
  const context = {
    ptyCollectionSyncPromise: null,
    performPtyTerminalSync: () => {
      calls += 1;
      return new Promise((resolve) => {
        resolveSync = resolve;
      });
    },
  };
  vm.runInNewContext(
    sourceBetween("function syncPtyTerminals()", "async function performPtyTerminalSync"),
    context,
  );

  const first = context.syncPtyTerminals();
  const second = context.syncPtyTerminals();
  assert.equal(first, second);
  assert.equal(calls, 1);
  resolveSync();
  await first;
  assert.equal(context.ptyCollectionSyncPromise, null);
});
