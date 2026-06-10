import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const source = readFileSync(new URL("./app.terminals-activity.js", import.meta.url), "utf8");

test("terminal assignments remain visually silent while preserving assignment IDs", () => {
  const context = {
    activePage: "chat",
    clearTimeout,
    document: { querySelectorAll: () => [] },
    escapeHtml: (value) => String(value).replaceAll("<", "&lt;"),
    setTimeout
  };
  vm.runInNewContext(source, context);

  const terminal = { id: "one" };
  const assignmentId = context.terminalTaskActivityStart(terminal, `Inspect   ${"<terminal>"}\nactivity`);
  assert.match(assignmentId, /^assignment-one-/);
  assert.equal(terminal.taskActivity, undefined);
  assert.equal(context.terminalTaskActivityHtml(terminal), "");
  context.terminalTaskActivityAccepted(terminal, assignmentId);
  context.terminalTaskActivityOutput(terminal, "Working...", { assignmentId });
  context.terminalTaskActivityFailed(terminal);
  assert.equal(terminal.taskActivity, undefined);
});

test("terminal activity helpers never create frontend status content", () => {
  const context = {
    activePage: "chat",
    clearTimeout,
    document: { querySelectorAll: () => [] },
    escapeHtml: String,
    setTimeout: () => 1
  };
  vm.runInNewContext(source, context);

  const terminal = { id: "one" };
  const assignmentId = context.terminalTaskActivityStart(terminal, "Inspect terminal UI", "assignment-1");
  assert.equal(assignmentId, "assignment-1");
  assert.equal(context.terminalTaskActivitySignature(terminal), "");
  assert.equal(context.terminalTaskActivityHtml(terminal), "");
  context.terminalTaskActivityClear(terminal);
  assert.equal(context.terminalTaskActivitySignature(terminal), "");
});

test("terminal activity cleanup removes stale persisted visual state", () => {
  const context = {
    activePage: "chat",
    clearTimeout,
    document: { querySelectorAll: () => [] },
    escapeHtml: String,
    setTimeout: () => 1
  };
  vm.runInNewContext(source, context);

  const terminal = { id: "one", taskActivity: { phase: "accepted" } };
  context.terminalTaskActivityClear(terminal);
  assert.equal(terminal.taskActivity, undefined);
});
