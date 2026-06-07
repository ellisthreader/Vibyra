import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("detached terminal worker finishes after the bridge client disconnects", async () => {
  const root = mkdtempSync(join(tmpdir(), "vibyra-terminal-safe-rails-"));
  process.env.VIBYRA_TERMINAL_SESSION_ROOT = root;
  const moduleUrl = new URL(`./aiTerminalPersistentProcess.mjs?test=${Date.now()}`, import.meta.url);
  const {
    connectPersistentAiTerminalProcess,
    launchPersistentAiTerminalProcess,
    listPersistentAiTerminalSessions
  } = await import(moduleUrl);
  const terminalId = `safe-rail-${Date.now()}`;
  let resolveSnapshot;
  const snapshotReady = new Promise((resolve) => { resolveSnapshot = resolve; });

  try {
    const handle = launchPersistentAiTerminalProcess({
      agent: "shell",
      terminalId,
      title: "Safe rail test",
      cwd: process.cwd(),
      cols: 100,
      rows: 30,
      model: "",
      reasoningEffort: "medium",
      permissionMode: "standard",
      tokenMode: "vibyra",
      projectId: ""
    }, { onSnapshot: resolveSnapshot });

    await withTimeout(snapshotReady, 5_000, "terminal worker did not attach");
    handle.stdin.write("printf 'SAFE_RAIL_STARTED\\n'; sleep 0.4; printf 'SAFE_RAIL_FINISHED\\n'; exit\r");
    await delay(100);
    handle.disconnect();
    let recoveredOutput = "";
    let resolveRecovered;
    const recovered = new Promise((resolve) => { resolveRecovered = resolve; });
    const reattached = connectPersistentAiTerminalProcess(terminalId, {
      onSnapshot: (payload) => {
        recoveredOutput = String(payload.output || "");
        if (recoveredOutput.includes("SAFE_RAIL_FINISHED")) resolveRecovered();
      },
      onData: (data) => {
        recoveredOutput += data;
        if (recoveredOutput.includes("SAFE_RAIL_FINISHED")) resolveRecovered();
      },
      onExit: resolveRecovered
    }, { waitForWorker: true });
    await withTimeout(recovered, 5_000, "new bridge client did not recover the running task");
    reattached.disconnect();

    const record = await waitFor(() => {
      const current = listPersistentAiTerminalSessions()
        .find((item) => item.config.terminalId === terminalId);
      return current?.state.status === "exited"
        && current.output.includes("SAFE_RAIL_FINISHED")
        ? current
        : null;
    }, 6_000);

    assert.match(record.output, /SAFE_RAIL_STARTED/);
    assert.match(record.output, /SAFE_RAIL_FINISHED/);
    assert.match(recoveredOutput, /SAFE_RAIL_STARTED/);
    assert.match(recoveredOutput, /SAFE_RAIL_FINISHED/);
  } finally {
    rmSync(root, { recursive: true, force: true });
    delete process.env.VIBYRA_TERMINAL_SESSION_ROOT;
  }
});

test("explicit close stops the worker and removes its saved session", async () => {
  const root = mkdtempSync(join(tmpdir(), "vibyra-terminal-close-"));
  process.env.VIBYRA_TERMINAL_SESSION_ROOT = root;
  const moduleUrl = new URL(`./aiTerminalPersistentProcess.mjs?close=${Date.now()}`, import.meta.url);
  const {
    launchPersistentAiTerminalProcess,
    listPersistentAiTerminalSessions
  } = await import(moduleUrl);
  const terminalId = `close-${Date.now()}`;
  let resolveSnapshot;
  const snapshotReady = new Promise((resolve) => { resolveSnapshot = resolve; });

  try {
    const handle = launchPersistentAiTerminalProcess({
      agent: "shell",
      terminalId,
      title: "Close test",
      cwd: process.cwd(),
      cols: 100,
      rows: 30,
      model: "",
      reasoningEffort: "medium",
      permissionMode: "standard",
      tokenMode: "vibyra",
      projectId: ""
    }, { onSnapshot: resolveSnapshot });

    await withTimeout(snapshotReady, 5_000, "terminal worker did not attach");
    handle.kill("SIGTERM");
    await waitFor(
      () => listPersistentAiTerminalSessions().some((item) => item.config.terminalId === terminalId) ? null : true,
      5_000
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
    delete process.env.VIBYRA_TERMINAL_SESSION_ROOT;
  }
});

test("immediate close is delivered while the worker socket is still connecting", async () => {
  const root = mkdtempSync(join(tmpdir(), "vibyra-terminal-immediate-close-"));
  process.env.VIBYRA_TERMINAL_SESSION_ROOT = root;
  const moduleUrl = new URL(`./aiTerminalPersistentProcess.mjs?immediate-close=${Date.now()}`, import.meta.url);
  const {
    launchPersistentAiTerminalProcess,
    listPersistentAiTerminalSessions
  } = await import(moduleUrl);
  const terminalId = `immediate-close-${Date.now()}`;

  try {
    const handle = launchPersistentAiTerminalProcess({
      agent: "shell",
      terminalId,
      title: "Immediate close test",
      cwd: process.cwd(),
      cols: 100,
      rows: 30,
      model: "",
      reasoningEffort: "medium",
      permissionMode: "standard",
      tokenMode: "vibyra",
      projectId: ""
    });

    handle.kill("SIGTERM");
    await waitFor(
      () => listPersistentAiTerminalSessions().some((item) => item.config.terminalId === terminalId) ? null : true,
      5_000
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
    delete process.env.VIBYRA_TERMINAL_SESSION_ROOT;
  }
});

async function waitFor(read, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = read();
    if (value) return value;
    await delay(50);
  }
  throw new Error("Timed out waiting for detached terminal task.");
}

async function withTimeout(promise, timeoutMs, message) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(message)), timeoutMs);
      })
    ]);
  } finally {
    clearTimeout(timer);
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
