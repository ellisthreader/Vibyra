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

test("pty output rendering batches dirty terminals instead of rebuilding the topbar", () => {
  const renderSource = sourceBetween("function schedulePtyRender", "function schedulePtySave");
  const dirtySource = sourceBetween("function refreshDirtyPtyTerminalsDom", "function refreshPtyTerminalDom");

  assert.match(renderSource, /terminalPtyRenderDirtyIds\.add\(id\)/);
  assert.match(renderSource, /refreshDirtyPtyTerminalsDom\(dirtyIds\)/);
  assert.doesNotMatch(
    renderSource.slice(0, renderSource.indexOf("if (!refreshDirtyPtyTerminalsDom")),
    /renderTopbar\(\)/,
  );
  assert.doesNotMatch(dirtySource, /patchPtyProjectShell/);
});

test("xterm mounting skips hidden project, focus, and fullscreen panes", () => {
  const visibilitySource = sourceBetween(
    "function terminalXtermNodeIsVisible",
    "function mergePtySnapshotOutput",
  );

  assert.match(visibilitySource, /terminal-focus-hidden/);
  assert.match(visibilitySource, /terminal-project-hidden/);
  assert.match(visibilitySource, /terminal-fullscreen-hidden/);
  assert.match(visibilitySource, /aria-hidden/);
});

test("xterm rendering avoids visible cursor blink and full replay during normal sync", () => {
  const mountSource = sourceBetween("function mountVisibleXterms", "function attachTerminalXtermClipboard");
  const syncSource = sourceBetween("function syncPtyXtermOutput", "function writePtySnapshot");

  assert.match(mountSource, /cursorBlink:\s*false/);
  assert.match(syncSource, /next\.startsWith\(previous\)/);
  assert.match(syncSource, /const suffix = next\.slice\(previous\.length\)/);
  assert.match(syncSource, /xterm\.write\(terminalDisplayOutput\(terminal, suffix\)/);
  assert.ok(syncSource.indexOf("next.startsWith(previous)") < syncSource.indexOf("xterm.reset()"));
});

test("pty session and socket paths mount only the affected xterm", () => {
  const socketSource = sourceBetween("function connectPtyTerminal", "function schedulePtyCollectionSync");
  const messageSource = sourceBetween("function handlePtySocketMessage", "const previousRenderTerminalsPage");
  const startSource = sourceBetween("function queueStartPtyTerminal", "function connectPtyTerminal");

  assert.match(socketSource, /mountVisibleXterms\(new Set\(\[terminal\.id\]\)\)/);
  assert.match(messageSource, /mountVisibleXterms\(new Set\(\[terminal\.id\]\)\)/);
  assert.match(startSource, /mountVisibleXterms\(new Set\(\[terminal\.id\]\)\)/);
});

test("xterm fit scheduling coalesces repeated requests per terminal", () => {
  const fitSource = sourceBetween("function schedulePtyXtermFit", "function scheduleSettledPtyXtermFit");

  assert.match(fitSource, /terminalXtermScheduledFits\.get\(id\)/);
  assert.match(fitSource, /pending\.forceBackend = pending\.forceBackend \|\| Boolean\(options\.forceBackend\)/);
  assert.match(fitSource, /if \(pending\.frame\)/);
  assert.match(fitSource, /runScheduledPtyXtermFit\(id\)/);
});
