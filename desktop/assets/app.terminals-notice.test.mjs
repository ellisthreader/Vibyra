import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const controlsSource = readFileSync(
  new URL("./app.terminals-controls.js", import.meta.url),
  "utf8",
);
const runtimeSource = readFileSync(
  new URL("./app.terminals-pty-runtime.js", import.meta.url),
  "utf8",
);

test("terminal notices remain dismissible after incremental PTY updates", () => {
  assert.match(controlsSource, /function bindTerminalNoticeControls/);
  assert.match(controlsSource, /terminal\.notice = null/);
  assert.match(controlsSource, /button\.closest\("\.terminal-notice"\)\?\.remove\(\)/);
  assert.match(controlsSource, /article\?\.classList\.remove\("has-notice"\)/);
  assert.match(runtimeSource, /bindTerminalNoticeControls\(notice\)/);
});
