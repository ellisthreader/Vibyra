import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const runtimeSource = readFileSync(
  new URL("./app.terminals-pty-runtime.js", import.meta.url),
  "utf8"
);
const ptySource = readFileSync(
  new URL("./app.terminals-pty.js", import.meta.url),
  "utf8"
);
const backendSource = readFileSync(
  new URL("../lib/ptyTerminals.mjs", import.meta.url),
  "utf8"
);
const html = readFileSync(new URL("../app.html", import.meta.url), "utf8");

test("Auto waiting state is authoritative and removed during provider transition", () => {
  assert.match(runtimeSource, /autoAwaitingTask:\s*Boolean\(session\.autoAwaitingTask\)/);
  assert.match(runtimeSource, /autoDeciding:\s*Boolean\(session\.autoDeciding\)/);
  assert.match(
    runtimeSource,
    /article\.classList\.toggle\("terminal-auto-waiting",\s*Boolean\(terminal\.autoAwaitingTask\)\)/
  );
  assert.match(runtimeSource, /article\.classList\.remove\([\s\S]*"terminal-provider-auto"/);
  assert.match(runtimeSource, /article\.classList\.add\(\.\.\.terminalProviderClass\(terminal\)/);
});

test("Auto deciding state brackets routing and is cleared before provider launch", () => {
  const activationStart = backendSource.indexOf("async function activateAutoTerminal");
  const activationEnd = backendSource.indexOf("\nfunction startAutoDecidingAnimation", activationStart);
  const activationSource = backendSource.slice(activationStart, activationEnd);

  assert.match(backendSource, /autoDeciding:\s*false/);
  assert.match(activationSource, /session\.autoDeciding = true/);
  assert.match(
    activationSource,
    /session\.autoDeciding = true[\s\S]*publish\(session\.id,\s*\{\s*type:\s*"session"/
  );
  assert.match(
    activationSource,
    /providerOutputGate = createAutoProviderOutputGate\(session,\s*decidingAnimation\)/
  );
  assert.match(
    activationSource,
    /publish\(session\.id,[\s\S]*createAutoProviderOutputGate[\s\S]*session\.process = launchPersistentAiTerminalProcess/
  );
  assert.match(backendSource, /if \(!session\.autoDeciding && output && output !== session\.output\)/);
  assert.match(backendSource, /queued\.push\(\{\s*data,\s*meta\s*\}\)/);
  assert.match(
    backendSource,
    /session\.autoDeciding = false;\s*decidingAnimation\.handoff\(\);[\s\S]*publishPersistentOutput/
  );
  assert.match(backendSource, /replaceOutput:\s*true/);
  assert.match(runtimeSource, /const localOutput = payload\.replaceOutput \? "" : String\(terminal\.output \|\| ""\)/);
  assert.match(backendSource, /session\.autoAwaitingTask = true;\s*session\.autoDeciding = false/);
  assert.match(backendSource, /replaceAutoOutput\(session,[\s\S]*autoTerminalWaitingOutput/);
});

test("provider transitions refresh visible model identity without remounting xterm", () => {
  assert.match(runtimeSource, /const modelChip = article\.querySelector\("\.terminal-model-chip"\)/);
  assert.match(runtimeSource, /modelChip\.innerHTML = `\$\{modelLogo\(model\)\}\$\{escapeHtml\(model\.label\)\}`/);

  const refreshStart = runtimeSource.indexOf("function refreshPtyTerminalDom");
  const refreshEnd = runtimeSource.indexOf("\nfunction refreshPtyTerminalSettingsMenus", refreshStart);
  const refreshSource = runtimeSource.slice(refreshStart, refreshEnd);
  assert.doesNotMatch(refreshSource, /replaceChildren|innerHTML\s*=\s*terminalViewport|mountVisibleXterms/);
});

test("waiting Auto status is presented as ready rather than active work", () => {
  assert.match(
    ptySource,
    /if \(terminal\.autoAwaitingTask\) return \{ key: "idle", label: "Auto ready for a task" \}/
  );
});

test("terminal polish assets load after the structural terminal styles", () => {
  const structural = html.indexOf("app.terminals-setup-flow.css");
  const chrome = html.indexOf("app.terminals-chrome-polish.css");
  const auto = html.indexOf("app.terminals-auto-polish.css");
  assert.ok(structural >= 0 && structural < chrome);
  assert.ok(chrome < auto);
});
