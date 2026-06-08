import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const source = readFileSync(new URL("./app.terminals-activity.js", import.meta.url), "utf8");

test("terminal activity summarizes, renders, and clears transient work", () => {
  const timers = [];
  const context = {
    activePage: "chat",
    clearTimeout,
    document: { querySelectorAll: () => [] },
    escapeHtml: (value) => String(value).replaceAll("<", "&lt;"),
    setTimeout: (callback, delay) => {
      timers.push({ callback, delay });
      return timers.length;
    }
  };
  vm.runInNewContext(source, context);

  const terminal = { id: "one" };
  context.terminalTaskActivityStart(terminal, `Inspect   ${"<terminal>"}\nactivity`);
  assert.equal(terminal.taskActivity.phase, "assigning");
  assert.equal(timers[0].delay, 15000);
  assert.match(context.terminalTaskActivityHtml(terminal), /Assigning task/);
  assert.match(context.terminalTaskActivityHtml(terminal), /&lt;terminal>/);

  context.terminalTaskActivityAccepted(terminal);
  assert.equal(terminal.taskActivity.phase, "accepted");
  assert.match(context.terminalTaskActivityHtml(terminal), /Task accepted/);

  context.terminalTaskActivityOutput(terminal, "Working...");
  assert.equal(terminal.taskActivity.phase, "working");
  assert.match(context.terminalTaskActivityHtml(terminal), /Vibyra is working/);

  context.terminalTaskActivityFailed(terminal);
  assert.equal(terminal.taskActivity, undefined);
});

test("terminal activity signatures change only with visible status content", () => {
  const context = {
    activePage: "chat",
    clearTimeout,
    document: { querySelectorAll: () => [] },
    escapeHtml: String,
    setTimeout
  };
  vm.runInNewContext(source, context);

  const terminal = { id: "one" };
  context.terminalTaskActivityStart(terminal, "Inspect terminal UI");
  const assigning = context.terminalTaskActivitySignature(terminal);
  context.terminalTaskActivityAccepted(terminal);
  const working = context.terminalTaskActivitySignature(terminal);

  assert.notEqual(assigning, working);
  assert.equal(context.terminalTaskActivitySignature(terminal), working);
  context.terminalTaskActivityClear(terminal);
  assert.equal(context.terminalTaskActivitySignature(terminal), "");
});
