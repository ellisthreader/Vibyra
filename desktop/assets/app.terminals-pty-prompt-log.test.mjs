import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const source = readFileSync(new URL("./app.terminals-pty-prompt-log.js", import.meta.url), "utf8");

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

test("PTY prompt logger reconstructs completed typed and pasted prompts", () => {
  const context = vm.createContext({});
  vm.runInContext(source, context);
  assert.deepEqual(
    plain(vm.runInContext(`terminalPtyCompletedPrompts("one", "Build the pagx\\x7fe\\r")`, context)),
    ["Build the page"]
  );
  assert.deepEqual(
    plain(vm.runInContext(`terminalPtyCompletedPrompts("two", "\\u001b[200~first line\\rsecond line\\u001b[201~\\r")`, context)),
    ["first line\nsecond line"]
  );
  assert.deepEqual(
    plain(vm.runInContext(`terminalPtyCompletedPrompts("three", "discard\\u0015keep\\r")`, context)),
    ["keep"]
  );
});

test("PTY prompt logger ignores navigation escapes and cancelled input", () => {
  const context = vm.createContext({});
  vm.runInContext(source, context);
  assert.deepEqual(
    plain(vm.runInContext(`terminalPtyCompletedPrompts("one", "draft\\u0003\\r")`, context)),
    []
  );
  assert.deepEqual(
    plain(vm.runInContext(`terminalPtyCompletedPrompts("two", "fix\\u001b[A this\\r")`, context)),
    ["fix this"]
  );
});

test("PTY prompt logger links cleaned output to the submitted turn", async () => {
  const calls = [];
  const terminal = {
    id: "terminal-1",
    model: "openai/gpt-5",
    providerState: "ready",
    title: "Codex 1"
  };
  const context = vm.createContext({
    clearTimeout,
    findTerminal: () => terminal,
    persistDesktopPromptOutcome: async (...args) => { calls.push(args); },
    setPtyInputNotice() {},
    setTimeout,
    terminalPlainActivityOutput: (value) => String(value).replace(/\x1b\[[0-9;]*m/g, "")
  });
  vm.runInContext(source, context);
  context.turn = {
    sessionId: "terminal-pty:terminal-1",
    startedAt: "2026-06-11T10:00:00.000Z",
    turnId: "turn-1"
  };
  vm.runInContext(
    `terminalPtyTrackTurn("terminal-1", "Fix it", turn, "terminal-pty");
     terminalPtyTranscriptOutput(${JSON.stringify(terminal)}, "\\u001b[32mDone\\u001b[0m\\r\\n", "busy");`,
    context
  );
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(calls.length, 1);
  assert.equal(calls[0][0].turnId, "turn-1");
  assert.equal(calls[0][1].result, "Done");
  assert.equal(calls[0][1].status, "completed");
});
