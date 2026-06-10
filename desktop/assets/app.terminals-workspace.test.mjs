import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const source = readFileSync(new URL("./app.terminals-workspace.js", import.meta.url), "utf8");

function context() {
  const sandbox = {
    escapeAttribute: String,
    escapeHtml: String,
    icon: (name) => `<i>${name}</i>`,
    normalizeTerminalWorkspaceMode: (value) => value === "worktree" ? "worktree" : "shared"
  };
  vm.runInNewContext(source, sandbox);
  return sandbox;
}

test("workspace display distinguishes isolated, shared, and fallback terminals", () => {
  const ui = context();
  assert.equal(ui.terminalWorkspaceDisplay({ projectId: "p", workspaceMode: "shared" }).label, "Shared folder");
  assert.equal(ui.terminalWorkspaceDisplay({
    projectId: "p", workspaceMode: "worktree", branchName: "vibyra/task-1"
  }).label, "Separate branch");
  const fallback = ui.terminalWorkspaceDisplay({
    projectId: "p",
    workspaceMode: "shared",
    workspaceNotice: "Separate branches need a saved Git checkpoint, but this project has changes that are not saved in Git yet."
  });
  assert.equal(fallback.label, "Shared for now");
  assert.equal(fallback.detail, "Save project changes first");
  assert.match(fallback.explanation, /files were not deleted/);
  assert.match(fallback.explanation, /GitHub is not required/);
  assert.match(fallback.explanation, /parallel terminals can edit the same files/i);
  assert.equal(ui.terminalWorkspaceCanCheckpoint({
    projectId: "p",
    workspaceMode: "shared",
    workspaceNotice: "Separate branches need a saved Git checkpoint, but this project has changes that are not saved in Git yet."
  }), true);
  assert.match(ui.terminalWorkspaceCheckpointLink({
    id: "two",
    projectId: "p",
    workspaceMode: "shared",
    workspaceNotice: "Separate branches need a saved Git checkpoint, but this project has changes that are not saved in Git yet."
  }), /Save local checkpoint/);
  assert.equal(ui.terminalWorkspaceCanCheckpoint({
    projectId: "p",
    workspaceMode: "shared",
    workspaceNotice: "Separate branches need a saved Git checkpoint, but this project has changes that are not saved in Git yet.",
    notice: "Local checkpoint saved. Reopen these terminals and choose Separate branches."
  }), false);
});

test("workspace indicator exposes branch and fallback state accessibly", () => {
  const ui = context();
  const isolated = ui.terminalWorkspaceIndicator({
    id: "one", projectId: "p", workspaceMode: "worktree", branchName: "vibyra/task-1"
  });
  assert.match(isolated, /Separate branch/);
  assert.match(isolated, /vibyra\/task-1/);
  assert.match(isolated, /Click for details/);
  const fallback = ui.terminalWorkspaceIndicator({
    id: "two", projectId: "p", workspaceMode: "shared", workspaceNotice: "Unavailable"
  });
  assert.match(fallback, /terminal-workspace-indicator fallback/);
  assert.match(fallback, /Separate branches unavailable/);
});
