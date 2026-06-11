import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const renderSource = readFileSync(new URL("./app.terminals-render.js", import.meta.url), "utf8");
const ptySource = readFileSync(new URL("./app.terminals-pty.js", import.meta.url), "utf8");
const controlsSource = readFileSync(new URL("./app.terminals-controls.js", import.meta.url), "utf8");
const runtimeSource = readFileSync(new URL("./app.terminals-pty-runtime.js", import.meta.url), "utf8");

test("wide grid orders eight terminals from top-left to bottom-right", () => {
  const context = { maxTerminals: 12 };
  vm.runInNewContext(renderSource, context);
  assert.deepEqual(
    JSON.parse(JSON.stringify(context.terminalGridMeta(8))),
    { className: "terminal-grid-many", cols: 4, rows: 2, narrowCols: 3, narrowRows: 3 }
  );
});

test("six terminals use a balanced three by two grid", () => {
  const context = { maxTerminals: 12 };
  vm.runInNewContext(renderSource, context);
  assert.deepEqual(
    JSON.parse(JSON.stringify(context.terminalGridMeta(6))),
    { className: "terminal-grid-many", cols: 3, rows: 2, narrowCols: 3, narrowRows: 2 }
  );
});

test("new PTY terminals append so terminal one stays first", () => {
  assert.match(ptySource, /terminals\.push\(terminal\)/);
  assert.doesNotMatch(ptySource, /terminals\.unshift\(terminal\)/);
  assert.match(ptySource, /terminal-grid-number/);
});

test("terminal reordering preserves xterm DOM and is keyboard accessible", () => {
  assert.match(runtimeSource, /preserveConnectedXtermElements\(\)/);
  assert.match(runtimeSource, /restoreConnectedXtermElements\(preservedXterms\)/);
  assert.match(runtimeSource, /if \(preservingPtyXtermElements\) return/);
  assert.match(ptySource, /aria-keyshortcuts="Alt\+ArrowLeft Alt\+ArrowRight"/);
  assert.match(controlsSource, /event\.altKey/);
  assert.match(controlsSource, /\["ArrowLeft", "ArrowRight"\]/);
});
