import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const checkpointSource = readFileSync(
  new URL("./app.terminals-checkpoint.js", import.meta.url),
  "utf8",
);
const controlsSource = readFileSync(
  new URL("./app.terminals-controls.js", import.meta.url),
  "utf8",
);
const runtimeSource = readFileSync(
  new URL("./app.terminals-pty-runtime.js", import.meta.url),
  "utf8",
);
const setupSource = readFileSync(
  new URL("./app.terminals-pty.js", import.meta.url),
  "utf8",
);
const stateSource = readFileSync(
  new URL("./app.terminals-state.js", import.meta.url),
  "utf8",
);

test("separate branches preflight explains and approves a local-only checkpoint", () => {
  assert.match(checkpointSource, /workspace\/\$\{action\}/);
  assert.match(checkpointSource, /terminalWorkspaceRequest\("preflight"/);
  assert.match(checkpointSource, /terminalWorkspaceRequest\("checkpoint"/);
  assert.match(checkpointSource, /Nothing is uploaded to GitHub/);
  assert.match(checkpointSource, /changed file/);
  assert.match(checkpointSource, /data-checkpoint-cancel/);
  assert.match(checkpointSource, /Save checkpoint and continue/);
});

test("cancelled preflight does not launch and approved setup forbids shared fallback", () => {
  assert.match(controlsSource, /ready = await prepareTerminalWorkspaceLaunch/);
  assert.match(controlsSource, /if \(!ready\) \{/);
  assert.match(controlsSource, /allowSharedFallback:\s*workspaceMode !== "worktree"/);
  assert.match(runtimeSource, /terminal\.allowSharedFallback !== false/);
});

test("safe mode is recommended and defaults on for new users", () => {
  assert.match(setupSource, /Workspace safety/);
  assert.match(setupSource, /"Safe mode"/);
  assert.match(setupSource, /Recommended/);
  assert.match(setupSource, /separate files to prevent overlap/);
  assert.match(setupSource, /Advanced: terminals can edit the same files/);
  assert.match(stateSource, /storedSetupWorkspaceMode === null[\s\S]*"worktree"/);
});

test("terminal setup stays compact with optional advanced token settings", () => {
  assert.match(setupSource, /const effort = terminalSetupEffortPicker\(model\)/);
  assert.match(setupSource, /data-terminal-advanced-toggle/);
  assert.match(setupSource, /Advanced options/);
  assert.match(setupSource, /terminalSetupAdvancedOpen/);
  assert.match(setupSource, /terminalSoloSetupHtml\(launchCount, setupCapacity\)/);
  assert.match(setupSource, /terminalSetupGridPreview\(total\)/);
});
