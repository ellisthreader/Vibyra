import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const legacySource = readFileSync(
  new URL("./app.terminals-pty.js", import.meta.url),
  "utf8",
);
const runtimeSource = readFileSync(
  new URL("./app.terminals-pty-runtime.js", import.meta.url),
  "utf8",
);

test("PTY keyboard input has one browser event owner", () => {
  assert.match(legacySource, /bindPtyInput\(node\)/);
  assert.doesNotMatch(legacySource, /addEventListener\("keydown"/);
  assert.doesNotMatch(legacySource, /addEventListener\("paste"/);

  assert.equal(
    [...runtimeSource.matchAll(/addEventListener\("keydown"/g)].length,
    1,
  );
  assert.equal(
    [...runtimeSource.matchAll(/addEventListener\("paste"/g)].length,
    1,
  );
  assert.equal([...runtimeSource.matchAll(/xterm\.onData\(/g)].length, 1);
  assert.match(runtimeSource, /if \(window\.Terminal\) return;/);
  assert.match(runtimeSource, /screenReaderMode: false/);
  assert.doesNotMatch(runtimeSource, /screenReaderMode: true/);
  assert.match(runtimeSource, /terminalXterms\[id\] !== xterm \|\| !xterm\.element\?\.isConnected/);
});

test("assigned terminal tasks are transient and submitted after PTY creation", () => {
  assert.match(legacySource, /\{\s*initialPrompt,\s*pending,/);
  assert.match(legacySource, /initialPrompt:\s*normalizeInitialTerminalPrompt\(options\.initialPrompt\)/);
  assert.match(runtimeSource, /Object\.assign\(terminal,\s*ptySessionPatch\(result\.session\)/);
  assert.match(runtimeSource, /await submitInitialPtyPrompt\(terminal\)/);
  assert.match(runtimeSource, /const input = `\\x1b\[200~\$\{prompt/);
  assert.match(runtimeSource, /\\x1b\[201~\\r`/);
  assert.match(runtimeSource, /if \(!response\.ok\) throw new Error/);
  assert.match(runtimeSource, /if \(!response\.ok\)[\s\S]*delete terminal\.initialPrompt/);
  assert.doesNotMatch(runtimeSource, /sendPtyInput\(terminal\.id,\s*"\\r"\)/);
  assert.match(runtimeSource, /terminal\.ptyStartQueued[\s\S]*terminal\.ptyStatus === "starting"/);
});

test("terminal workspace mode is persisted and sent to the authoritative PTY service", () => {
  assert.match(legacySource, /workspaceMode:\s*normalizeTerminalWorkspaceMode\(options\.workspaceMode\)/);
  assert.match(legacySource, /terminalWorkspaceSetupPicker\(\)/);
  assert.match(runtimeSource, /workspaceMode:\s*terminal\.workspaceMode/);
  assert.match(runtimeSource, /allowSharedFallback:\s*terminal\.workspaceMode === "worktree"/);
  assert.match(runtimeSource, /workspaceMode:\s*normalizeTerminalWorkspaceMode\(session\.workspaceMode\)/);
  assert.match(runtimeSource, /branchName:\s*String\(session\.branchName/);
  assert.match(runtimeSource, /workspaceNotice:\s*String\(session\.workspaceNotice/);
  assert.match(runtimeSource, /refreshTerminalWorkspaceIndicator\(article,\s*terminal\)/);
  assert.match(runtimeSource, /insertAdjacentHTML\("afterend",\s*terminalNotice\(terminal\)\)/);
});
