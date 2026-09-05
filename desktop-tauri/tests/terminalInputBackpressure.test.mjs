import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";

test("writes invoke IPC immediately while replies are pending and capacity errors remain visible", async () => {
  const source = await readFile(new URL("../src/ipc/terminal.ts", import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
  } }).outputText;
  const posted = [], notices = [];
  let reject;
  const pending = new Promise((_, fail) => { reject = fail; });
  const exports = {};
  vm.runInNewContext(compiled, { exports, require(name) {
    if (name === "@tauri-apps/api/core") return { invoke(command, input) {
      posted.push({ command, ...input }); return pending;
    } };
    return {};
  } });
  const first = exports.writeTerminal(1, "a");
  const second = exports.writeTerminal(1, "b");
  assert.equal(first, pending);
  assert.equal(second, pending);
  assert.deepEqual(posted, [{ command: "write_terminal", id: 1, data: "a" }, { command: "write_terminal", id: 1, data: "b" }]);
  const noticeSource = await readFile(new URL("../src/lib/terminalInputNotice.ts", import.meta.url), "utf8");
  const noticeModule = {};
  vm.runInNewContext(ts.transpileModule(noticeSource, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
  } }).outputText, { exports: noticeModule, require() {
    return { useNotificationStore: { getState: () => ({ push: (notice) => notices.push(notice) }) } };
  } });
  const registry = await readFile(new URL("../src/lib/terminalRegistry.ts", import.meta.url), "utf8");
  const handler = registry.match(/term\.onData\(\(data\) => \{([\s\S]*?)\n\s*\}\);/)[1];
  const onData = vm.runInNewContext(`(data) => { ${handler} }`, {
    id: 1, clearAttention() {}, sessionInputReceived() {}, writeTerminal: exports.writeTerminal,
    reportTerminalInputFailure: noticeModule.reportTerminalInputFailure,
  });
  onData("c");
  reject("Terminal input buffer is full");
  await assert.rejects(first);
  await assert.rejects(second);
  assert.equal(notices.length, 1);
  assert.equal(notices[0].inputRejected, true);
  assert.equal(notices[0].replaceKey, "terminal-input-full:1");
  assert.equal(notices[0].osEligible, false);
});
