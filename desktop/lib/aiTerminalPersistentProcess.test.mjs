import test from "node:test";
import assert from "node:assert/strict";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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

test("terminal title updates persist in the detached session config", async () => {
  const root = mkdtempSync(join(tmpdir(), "vibyra-terminal-rename-"));
  process.env.VIBYRA_TERMINAL_SESSION_ROOT = root;
  const moduleUrl = new URL(`./aiTerminalPersistentProcess.mjs?rename=${Date.now()}`, import.meta.url);
  const {
    launchPersistentAiTerminalProcess,
    listPersistentAiTerminalSessions,
    persistentTerminalPaths,
    updatePersistentAiTerminalSession
  } = await import(moduleUrl);
  const terminalId = `rename-${Date.now()}`;

  try {
    const handle = launchPersistentAiTerminalProcess({
      agent: "shell",
      terminalId,
      title: "Original name",
      cwd: process.cwd(),
      cols: 100,
      rows: 30,
      model: "",
      reasoningEffort: "medium",
      permissionMode: "standard",
      tokenMode: "vibyra",
      projectId: ""
    });
    assert.equal(updatePersistentAiTerminalSession(terminalId, { title: "Build checks" }), true);
    const config = JSON.parse(readFileSync(persistentTerminalPaths(terminalId).config, "utf8"));
    assert.equal(config.title, "Build checks");
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

test("semantic assignments queue before worker attach and deliver each assignment ID exactly once", async () => {
  const root = mkdtempSync(join(tmpdir(), "vibyra-terminal-assignment-"));
  const capture = join(root, "assignments.log");
  const cli = fakeCli(root, "capture-cli", [
    "#!/bin/bash",
    "sleep 0.2",
    "while IFS= read -r line; do",
    `  printf '%s\\n' "$line" >> ${shellQuote(capture)}`,
    "done"
  ]);
  process.env.VIBYRA_TERMINAL_SESSION_ROOT = root;
  process.env.VIBYRA_CODEX_CLI = cli;
  const moduleUrl = new URL(`./aiTerminalPersistentProcess.mjs?assignment=${Date.now()}`, import.meta.url);
  const { launchPersistentAiTerminalProcess, listPersistentAiTerminalSessions } = await import(moduleUrl);
  const terminalId = `assignment-${Date.now()}`;

  try {
    const handle = launchPersistentAiTerminalProcess(terminalConfig(terminalId));
    const first = handle.assign({
      assignmentId: "job-1",
      data: "EXACT_ONCE_ASSIGNMENT\r",
      timeoutMs: 5_000
    });
    const firstAck = await first;
    const duplicateAck = await handle.assign({
      assignmentId: "job-1",
      data: "EXACT_ONCE_ASSIGNMENT\r",
      timeoutMs: 5_000
    });

    assert.equal(firstAck.state, "written-to-child");
    assert.equal(duplicateAck.state, "written-to-child");
    assert.equal(duplicateAck.duplicate, true);
    const conflictAck = await handle.assign({
      assignmentId: "job-1",
      data: "DIFFERENT_ASSIGNMENT\r",
      timeoutMs: 5_000
    });
    assert.equal(conflictAck.state, "rejected");
    assert.match(conflictAck.reason, /different prompt/i);
    await waitFor(() => {
      try {
        return occurrences(readFileSync(capture, "utf8"), "EXACT_ONCE_ASSIGNMENT") === 1;
      } catch {
        return false;
      }
    }, 5_000);
    assert.equal(occurrences(readFileSync(capture, "utf8"), "EXACT_ONCE_ASSIGNMENT"), 1);
    handle.kill("SIGTERM");
    await waitFor(
      () => listPersistentAiTerminalSessions().some((item) => item.config.terminalId === terminalId) ? null : true,
      5_000
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
    delete process.env.VIBYRA_TERMINAL_SESSION_ROOT;
    delete process.env.VIBYRA_CODEX_CLI;
  }
});

test("semantic assignments reject invalid payloads and fallback shells", async () => {
  const root = mkdtempSync(join(tmpdir(), "vibyra-terminal-assignment-reject-"));
  const cli = fakeCli(root, "exit-cli", ["#!/bin/bash", "exit 0"]);
  process.env.VIBYRA_TERMINAL_SESSION_ROOT = root;
  process.env.VIBYRA_CODEX_CLI = cli;
  const moduleUrl = new URL(`./aiTerminalPersistentProcess.mjs?assignment-reject=${Date.now()}`, import.meta.url);
  const { launchPersistentAiTerminalProcess, listPersistentAiTerminalSessions } = await import(moduleUrl);
  const terminalId = `assignment-reject-${Date.now()}`;
  let output = "";

  try {
    const handle = launchPersistentAiTerminalProcess(terminalConfig(terminalId), {
      onSnapshot: (payload) => { output = String(payload.output || ""); },
      onData: (data) => { output += data; }
    });
    const invalid = await handle.assign({
      assignmentId: "invalid-job",
      data: "",
      timeoutMs: 5_000
    });
    assert.equal(invalid.state, "rejected");
    assert.match(invalid.reason, /prompt are required/i);

    await waitFor(() => output.includes("Project shell ready"), 5_000);
    const fallback = await handle.assign({
      assignmentId: "fallback-job",
      data: "MUST_NOT_REACH_SHELL\r",
      timeoutMs: 5_000
    });
    assert.equal(fallback.state, "rejected");
    assert.equal(fallback.providerState, "fallback-shell");
    assert.match(fallback.reason, /project shell/i);
    assert.doesNotMatch(output, /MUST_NOT_REACH_SHELL/);
    handle.kill("SIGTERM");
    await waitFor(
      () => listPersistentAiTerminalSessions().some((item) => item.config.terminalId === terminalId) ? null : true,
      5_000
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
    delete process.env.VIBYRA_TERMINAL_SESSION_ROOT;
    delete process.env.VIBYRA_CODEX_CLI;
  }
});

test("semantic assignment acknowledgement uses a bounded timeout", async () => {
  const root = mkdtempSync(join(tmpdir(), "vibyra-terminal-assignment-timeout-"));
  process.env.VIBYRA_TERMINAL_SESSION_ROOT = root;
  const moduleUrl = new URL(`./aiTerminalPersistentProcess.mjs?assignment-timeout=${Date.now()}`, import.meta.url);
  const { connectPersistentAiTerminalProcess, persistentTerminalPaths } = await import(moduleUrl);
  const terminalId = `assignment-timeout-${Date.now()}`;
  const paths = persistentTerminalPaths(terminalId);
  mkdirSync(paths.dir, { recursive: true });
  const messages = [];
  const server = createServer((socket) => {
    socket.setEncoding("utf8");
    socket.on("data", (chunk) => messages.push(chunk));
  });
  await new Promise((resolve) => server.listen(paths.socket, resolve));

  try {
    const handle = connectPersistentAiTerminalProcess(terminalId);
    const result = await handle.assign({
      assignmentId: "timeout-job",
      data: "NO_ACK\r",
      timeoutMs: 100
    });
    assert.equal(result.state, "timed-out");
    await delay(20);
    assert.match(messages.join(""), /"type":"assign"/);
    assert.match(messages.join(""), /"type":"assignment_cancel"/);
    handle.disconnect();
  } finally {
    await new Promise((resolve) => server.close(resolve));
    rmSync(root, { recursive: true, force: true });
    delete process.env.VIBYRA_TERMINAL_SESSION_ROOT;
  }
});

function terminalConfig(terminalId) {
  return {
    agent: "codex",
    terminalId,
    title: "Assignment test",
    cwd: process.cwd(),
    cols: 100,
    rows: 30,
    model: "",
    reasoningEffort: "medium",
    permissionMode: "standard",
    tokenMode: "vibyra",
    projectId: ""
  };
}

function fakeCli(root, name, lines) {
  const path = join(root, name);
  writeFileSync(path, `${lines.join("\n")}\n`);
  chmodSync(path, 0o755);
  return path;
}

function occurrences(value, pattern) {
  return String(value).split(pattern).length - 1;
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, "'\\''")}'`;
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
