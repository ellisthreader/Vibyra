import test from "node:test";
import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AI_TERMINAL_LAUNCH_CONTRACT_VERSION } from "./aiTerminalProviderAdapters.mjs";

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
      terminalGatewayToken: "private-terminal-token",
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
    await removeTreeEventually(root);
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
      terminalGatewayToken: "private-terminal-token",
      projectId: ""
    }, { onSnapshot: resolveSnapshot });

    await withTimeout(snapshotReady, 5_000, "terminal worker did not attach");
    handle.kill("SIGTERM");
    await waitFor(
      () => listPersistentAiTerminalSessions().some((item) => item.config.terminalId === terminalId) ? null : true,
      5_000
    );
  } finally {
    await removeTreeEventually(root);
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
      terminalGatewayToken: "private-terminal-token",
      projectId: ""
    });

    handle.kill("SIGTERM");
    await waitFor(
      () => listPersistentAiTerminalSessions().some((item) => item.config.terminalId === terminalId) ? null : true,
      5_000
    );
  } finally {
    await removeTreeEventually(root);
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
      terminalGatewayToken: "private-terminal-token",
      projectId: ""
    });
    assert.equal(updatePersistentAiTerminalSession(terminalId, {
      title: "Build checks",
      model: "openai/gpt-5.5"
    }), true);
    const config = JSON.parse(readFileSync(persistentTerminalPaths(terminalId).config, "utf8"));
    assert.equal(config.title, "Build checks");
    assert.equal(config.model, "openai/gpt-5.5");
    assert.equal(config.terminalGatewayToken, "private-terminal-token");
    handle.kill("SIGTERM");
    await waitFor(
      () => listPersistentAiTerminalSessions().some((item) => item.config.terminalId === terminalId) ? null : true,
      5_000
    );
  } finally {
    await removeTreeEventually(root);
    delete process.env.VIBYRA_TERMINAL_SESSION_ROOT;
  }
});

test("legacy Vibyra launch sessions are not compatible with the current runtime", async () => {
  const root = mkdtempSync(join(tmpdir(), "vibyra-terminal-runtime-version-"));
  process.env.VIBYRA_TERMINAL_SESSION_ROOT = root;
  const moduleUrl = new URL(`./aiTerminalPersistentProcess.mjs?runtime=${Date.now()}`, import.meta.url);
  const {
    AI_TERMINAL_GEMINI_PROFILE_VERSION,
    AI_TERMINAL_RUNTIME_VERSION,
    persistentAiTerminalConfigIsCurrent
  } = await import(moduleUrl);

  try {
    assert.equal(AI_TERMINAL_RUNTIME_VERSION, 13);
    assert.equal(persistentAiTerminalConfigIsCurrent({ agent: "vibyra" }), false);
    assert.equal(persistentAiTerminalConfigIsCurrent({
      agent: "vibyra",
      runtimeVersion: AI_TERMINAL_RUNTIME_VERSION,
      launchPlan: { launchContractVersion: AI_TERMINAL_LAUNCH_CONTRACT_VERSION }
    }), true);
    assert.equal(persistentAiTerminalConfigIsCurrent({
      agent: "vibyra",
      tokenMode: "vibyra",
      runtimeVersion: AI_TERMINAL_RUNTIME_VERSION,
      launchPlan: { runtimeId: "gemini", launchContractVersion: AI_TERMINAL_LAUNCH_CONTRACT_VERSION }
    }), false);
    assert.equal(persistentAiTerminalConfigIsCurrent({
      agent: "vibyra",
      tokenMode: "vibyra",
      runtimeVersion: AI_TERMINAL_RUNTIME_VERSION,
      geminiProfileVersion: AI_TERMINAL_GEMINI_PROFILE_VERSION,
      launchPlan: { runtimeId: "gemini", launchContractVersion: AI_TERMINAL_LAUNCH_CONTRACT_VERSION }
    }), true);
    assert.equal(persistentAiTerminalConfigIsCurrent({
      agent: "claude",
      tokenMode: "vibyra"
    }), false);
    assert.equal(persistentAiTerminalConfigIsCurrent({
      agent: "claude",
      tokenMode: "vibyra",
      runtimeVersion: AI_TERMINAL_RUNTIME_VERSION,
      launchPlan: { launchContractVersion: AI_TERMINAL_LAUNCH_CONTRACT_VERSION }
    }), true);
    assert.equal(persistentAiTerminalConfigIsCurrent({
      agent: "claude",
      tokenMode: "provider"
    }), false);
    assert.equal(persistentAiTerminalConfigIsCurrent({
      agent: "claude",
      tokenMode: "provider",
      runtimeVersion: AI_TERMINAL_RUNTIME_VERSION
    }), true);
    assert.equal(persistentAiTerminalConfigIsCurrent({ agent: "shell" }), true);
  } finally {
    await removeTreeEventually(root);
    delete process.env.VIBYRA_TERMINAL_SESSION_ROOT;
  }
});

test("semantic assignments queue before worker attach and deliver each assignment ID exactly once", async () => {
  const root = mkdtempSync(join(tmpdir(), "vibyra-terminal-assignment-"));
  const capture = join(root, "assignments.log");
  const cli = fakeCli(root, "capture-cli", [
    "#!/bin/bash",
    "sleep 0.2",
    "printf 'Write tests for @filename\\n'",
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
    await removeTreeEventually(root);
    delete process.env.VIBYRA_TERMINAL_SESSION_ROOT;
    delete process.env.VIBYRA_CODEX_CLI;
  }
});

test("Codex assignments broadcast busy until the CLI restores its idle title", async () => {
  const root = mkdtempSync(join(tmpdir(), "vibyra-terminal-live-state-"));
  const cli = fakeCli(root, "live-state-cli", [
    "#!/bin/bash",
    "printf 'Write tests for @filename\\n'",
    "while IFS= read -r line; do",
    "  printf '\\033]0;⠋ Test\\007'",
    "  sleep 0.05",
    "  printf '\\033]0;Test\\007'",
    "done"
  ]);
  process.env.VIBYRA_TERMINAL_SESSION_ROOT = root;
  process.env.VIBYRA_CODEX_CLI = cli;
  const moduleUrl = new URL(`./aiTerminalPersistentProcess.mjs?live-state=${Date.now()}`, import.meta.url);
  const { launchPersistentAiTerminalProcess, listPersistentAiTerminalSessions } = await import(moduleUrl);
  const terminalId = `live-state-${Date.now()}`;
  const providerStates = [];

  try {
    const handle = launchPersistentAiTerminalProcess(terminalConfig(terminalId), {
      onSnapshot: (payload) => providerStates.push(payload.state?.providerState)
    });
    const acknowledgement = await handle.assign({
      assignmentId: "live-state-job",
      data: "SHOW_LIVE_STATE\r",
      timeoutMs: 5_000
    });

    assert.equal(acknowledgement.state, "written-to-child");
    assert.equal(acknowledgement.providerState, "busy");
    await waitFor(() => {
      const busyIndex = providerStates.indexOf("busy");
      const readyIndex = providerStates.lastIndexOf("ready");
      return busyIndex >= 0 && readyIndex > busyIndex;
    }, 5_000);
    handle.kill("SIGTERM");
    await waitFor(
      () => listPersistentAiTerminalSessions().some((item) => item.config.terminalId === terminalId) ? null : true,
      5_000
    );
  } finally {
    await removeTreeEventually(root);
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

    await waitFor(() => listPersistentAiTerminalSessions()
      .find((item) => item.config.terminalId === terminalId)?.state.status === "exited", 5_000);
    const fallback = await handle.assign({
      assignmentId: "fallback-job",
      data: "MUST_NOT_REACH_SHELL\r",
      timeoutMs: 5_000
    });
    assert.equal(fallback.state, "rejected");
    assert.equal(fallback.providerState, "exited");
    assert.match(fallback.reason, /exited|not running/i);
    assert.doesNotMatch(output, /MUST_NOT_REACH_SHELL/);
    handle.kill("SIGTERM");
    await waitFor(
      () => listPersistentAiTerminalSessions().some((item) => item.config.terminalId === terminalId) ? null : true,
      5_000
    );
  } finally {
    await removeTreeEventually(root);
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
    await removeTreeEventually(root);
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
    model: "openai/gpt-5.5",
    reasoningEffort: "medium",
    permissionMode: "standard",
    tokenMode: "vibyra",
    launchPlan: {
      billingMode: "vibyra",
      providerId: "openai",
      runtimeId: "codex",
      adapterId: "responses",
      protocol: "openai-responses",
      nativeModel: "openai/gpt-5.5",
      billingModel: "openai/gpt-5.5",
      allowedModels: ["openai/gpt-5.5"],
      permissionMode: "standard",
      sandboxMode: "workspace-write",
      launchContractVersion: AI_TERMINAL_LAUNCH_CONTRACT_VERSION
    },
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

async function removeTreeEventually(path) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try { rmSync(path, { recursive: true, force: true }); } catch {}
    if (!existsSync(path)) return;
    await delay(25);
  }
  rmSync(path, { recursive: true, force: true });
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
