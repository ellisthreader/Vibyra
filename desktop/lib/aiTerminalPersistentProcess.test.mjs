import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:net";
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
    handle.resize(120, 40);
    assert.equal(handle.kill("SIGWINCH"), true);
    assert.equal(handle.stdin.writable, true);
    handle.stdin.write("printf 'SAFE_RAIL_STARTED\\n'; sleep 0.2; printf 'SAFE_RAIL_SIZE='; stty size; sleep 0.2; printf 'SAFE_RAIL_FINISHED\\n'; exit\r");
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
    assert.match(record.output, /SAFE_RAIL_SIZE=40 120/);
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

test("detached worker submits its initial assignment without browser input", async () => {
  const root = mkdtempSync(join(tmpdir(), "vibyra-terminal-initial-prompt-"));
  process.env.VIBYRA_TERMINAL_SESSION_ROOT = root;
  const moduleUrl = new URL(`./aiTerminalPersistentProcess.mjs?initial-prompt=${Date.now()}`, import.meta.url);
  const {
    launchPersistentAiTerminalProcess,
    listPersistentAiTerminalSessions
  } = await import(moduleUrl);
  const terminalId = `initial-prompt-${Date.now()}`;
  let handle;

  try {
    handle = launchPersistentAiTerminalProcess({
      agent: "shell",
      terminalId,
      title: "Assigned worker",
      jobId: "job-test",
      jobRole: "worker",
      initialPrompt: "printf 'INITIAL_ASSIGNMENT_RAN\\n'; exit",
      cwd: process.cwd(),
      cols: 100,
      rows: 30,
      model: "",
      reasoningEffort: "medium",
      permissionMode: "standard",
      tokenMode: "vibyra",
      projectId: ""
    });

    const record = await waitFor(() => {
      const current = listPersistentAiTerminalSessions()
        .find((item) => item.config.terminalId === terminalId);
      return current?.output.includes("INITIAL_ASSIGNMENT_RAN") ? current : null;
    }, 6_000);

    assert.equal(record.config.jobId, "job-test");
    assert.equal(record.config.jobRole, "worker");
    assert.equal(record.config.initialPrompt, "printf 'INITIAL_ASSIGNMENT_RAN\\n'; exit");
  } finally {
    handle?.disconnect();
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
    persistentTerminalPaths
  } = await import(moduleUrl);
  const terminalId = `immediate-close-${Date.now()}`;
  const paths = persistentTerminalPaths(terminalId);

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
    await waitFor(() => existsSync(paths.dir) ? null : true, 5_000);
  } finally {
    rmSync(root, { recursive: true, force: true });
    delete process.env.VIBYRA_TERMINAL_SESSION_ROOT;
  }
});

test("input queued before the worker socket exists survives connection retries", async () => {
  const root = mkdtempSync(join(tmpdir(), "vibyra-terminal-queued-input-"));
  process.env.VIBYRA_TERMINAL_SESSION_ROOT = root;
  const moduleUrl = new URL(`./aiTerminalPersistentProcess.mjs?queued-input=${Date.now()}`, import.meta.url);
  const {
    connectPersistentAiTerminalProcess,
    persistentTerminalPaths
  } = await import(moduleUrl);
  const terminalId = `queued-input-${Date.now()}`;
  const paths = persistentTerminalPaths(terminalId);
  let handle;
  let server;

  try {
    mkdirSync(paths.dir, { recursive: true });
    let resolveInput;
    const inputReady = new Promise((resolve) => { resolveInput = resolve; });
    handle = connectPersistentAiTerminalProcess(terminalId, {}, { waitForWorker: true });
    assert.equal(handle.stdin.write("EARLY_KEYSTROKE"), true);
    await delay(120);
    server = createMessageServer((payload) => {
      if (payload.type === "input") resolveInput(payload);
    });
    await listen(server, paths.socket);

    const payload = await withTimeout(inputReady, 3_000, "queued input was lost before worker connect");
    assert.equal(payload.data, "EARLY_KEYSTROKE");
  } finally {
    handle?.disconnect();
    await closeServer(server);
    rmSync(root, { recursive: true, force: true });
    delete process.env.VIBYRA_TERMINAL_SESSION_ROOT;
  }
});

test("SIGWINCH keeps the persistent terminal writable", async () => {
  const root = mkdtempSync(join(tmpdir(), "vibyra-terminal-resize-signal-"));
  process.env.VIBYRA_TERMINAL_SESSION_ROOT = root;
  const moduleUrl = new URL(`./aiTerminalPersistentProcess.mjs?resize-signal=${Date.now()}`, import.meta.url);
  const {
    connectPersistentAiTerminalProcess,
    persistentTerminalPaths
  } = await import(moduleUrl);
  const terminalId = `resize-signal-${Date.now()}`;
  const paths = persistentTerminalPaths(terminalId);
  let handle;
  let server;

  try {
    mkdirSync(paths.dir, { recursive: true });
    const messages = [];
    let resolveInput;
    const inputReady = new Promise((resolve) => { resolveInput = resolve; });
    server = createMessageServer((payload) => {
      messages.push(payload);
      if (payload.type === "input") resolveInput(payload);
    });
    await listen(server, paths.socket);
    handle = connectPersistentAiTerminalProcess(terminalId);
    await waitFor(() => messages.some((payload) => payload.type === "attach"), 2_000);

    assert.equal(handle.kill("SIGWINCH"), true);
    assert.equal(handle.stdin.writable, true);
    assert.equal(handle.stdin.write("AFTER_RESIZE"), true);
    await withTimeout(inputReady, 2_000, "input stopped after SIGWINCH");

    assert.equal(messages.some((payload) => payload.type === "close"), false);
    assert.ok(messages.some((payload) => payload.type === "input" && payload.data === "AFTER_RESIZE"));
  } finally {
    handle?.disconnect();
    await closeServer(server);
    rmSync(root, { recursive: true, force: true });
    delete process.env.VIBYRA_TERMINAL_SESSION_ROOT;
  }
});

function createMessageServer(onMessage) {
  const sockets = new Set();
  const server = createServer((socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
    socket.setEncoding("utf8");
    let pending = "";
    socket.on("data", (chunk) => {
      pending += chunk;
      const lines = pending.split("\n");
      pending = lines.pop() || "";
      for (const line of lines) {
        try { onMessage(JSON.parse(line)); } catch {}
      }
    });
  });
  server.vibyraSockets = sockets;
  return server;
}

function listen(server, path) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(path, resolve);
  });
}

function closeServer(server) {
  if (!server?.listening) return Promise.resolve();
  for (const socket of server.vibyraSockets || []) socket.destroy();
  return new Promise((resolve) => server.close(resolve));
}

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
