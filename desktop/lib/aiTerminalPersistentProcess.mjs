import { createHash } from "node:crypto";
import { closeSync, mkdirSync, openSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createConnection } from "node:net";
import { spawn } from "node:child_process";
import { AI_TERMINAL_LAUNCH_CONTRACT_VERSION } from "./aiTerminalProviderAdapters.mjs";
import { TERMINAL_TEAM_ROLE_CONTRACT_VERSION } from "./terminalTeamPromptRoles.mjs";

const moduleDir = dirname(fileURLToPath(import.meta.url));
const workerPath = join(moduleDir, "aiTerminalWorker.mjs");
const sessionRoot = process.env.VIBYRA_TERMINAL_SESSION_ROOT
  || join(homedir(), ".vibyra-agent", "terminal-sessions");
export const AI_TERMINAL_RUNTIME_VERSION = 18;
export const AI_TERMINAL_GEMINI_PROFILE_VERSION = 1;
const TERMINAL_STARTUP_TIMEOUT_MS = 45_000;
const TERMINAL_STARTUP_STABILITY_MS = 100;

export function launchPersistentAiTerminalProcess(config, handlers = {}) {
  const paths = persistentTerminalPaths(config.terminalId);
  mkdirSync(paths.dir, { recursive: true, mode: 0o700 });
  writeFileSync(paths.config, JSON.stringify(serializableConfig(config), null, 2), { mode: 0o600 });
  const logFd = openSync(paths.workerLog, "a", 0o600);
  const launch = isolatedLaunch(process.execPath, [workerPath, paths.config]);
  const child = spawn(launch.command, launch.args, {
    detached: true,
    env: process.env,
    stdio: ["ignore", logFd, logFd]
  });
  closeSync(logFd);
  child.unref();
  return connectPersistentAiTerminalProcess(config.terminalId, handlers, { waitForWorker: true });
}

export async function waitForPersistentAiTerminalStartup(
  terminalId,
  timeoutMs = TERMINAL_STARTUP_TIMEOUT_MS
) {
  const paths = persistentTerminalPaths(terminalId);
  const deadline = Date.now() + Math.max(250, Number(timeoutMs) || TERMINAL_STARTUP_TIMEOUT_MS);
  while (Date.now() < deadline) {
    const state = readJson(paths.state);
    if (state?.status === "running" && Number(state.childPid) > 0) {
      await delay(TERMINAL_STARTUP_STABILITY_MS);
      const stableState = readJson(paths.state);
      if (stableState?.status === "running" && Number(stableState.childPid) > 0) {
        return stableState;
      }
      if (stableState?.status === "exited") {
        throw persistentStartupError(readTail(paths.output, 12_000), stableState);
      }
    }
    if (state?.status === "exited") {
      throw persistentStartupError(readTail(paths.output, 12_000), state);
    }
    await delay(25);
  }
  const error = new Error("The terminal worker did not start its AI provider in time.");
  error.code = "terminal_worker_startup_timeout";
  error.status = 504;
  throw error;
}

function isolatedLaunch(command, args) {
  if (process.platform !== "linux") return { command, args };
  const closeDescriptors = "for path in /proc/$$/fd/*; do fd=${path##*/}; if [ \"$fd\" -gt 2 ] 2>/dev/null; then eval \"exec ${fd}>&-\"; fi; done; exec \"$@\"";
  return {
    command: "/bin/bash",
    args: ["-c", closeDescriptors, "vibyra-terminal-worker", command, ...args]
  };
}

export function connectPersistentAiTerminalProcess(terminalId, handlers = {}, options = {}) {
  const paths = persistentTerminalPaths(terminalId);
  let socket = null;
  let stopped = false;
  let closing = false;
  let retryTimer = null;
  let retryCount = 0;
  const queued = [];
  const pendingAssignments = new Map();
  const socketReady = () => socket?.readyState === "open" && socket.writable;

  const send = (payload) => {
    if (!socketReady()) {
      if (!stopped) queued.push(payload);
      return !stopped;
    }
    socket.write(`${JSON.stringify(payload)}\n`);
    return true;
  };
  const connect = () => {
    if (stopped) return;
    socket = createConnection(paths.socket);
    let pending = "";
    socket.setEncoding("utf8");
    socket.on("connect", () => {
      retryCount = 0;
      socket.write(`${JSON.stringify({ type: "attach" })}\n`);
      while (queued.length && socketReady()) {
        socket.write(`${JSON.stringify(queued.shift())}\n`);
      }
      if (closing) stopped = true;
    });
    socket.on("data", (chunk) => {
      pending += chunk;
      const lines = pending.split("\n");
      pending = lines.pop() || "";
      for (const line of lines) {
        const payload = handleWorkerMessage(line, handlers);
        if (payload?.type === "assignment_ack") {
          const pendingAssignment = pendingAssignments.get(String(payload.messageId || ""));
          if (pendingAssignment) {
            clearTimeout(pendingAssignment.timer);
            pendingAssignments.delete(String(payload.messageId || ""));
            pendingAssignment.resolve(payload);
          }
        }
        if (payload?.type === "exit") stopped = true;
      }
    });
    socket.on("error", () => {});
    socket.on("close", () => {
      socket = null;
      if (!stopped && options.waitForWorker && retryCount < 40) {
        retryCount += 1;
        retryTimer = setTimeout(connect, Math.min(1000, 50 * retryCount));
        retryTimer.unref?.();
      }
    });
  };

  connect();
  return {
    stdin: {
      get writable() { return !stopped; },
      write(input) { return send({ type: "input", data: String(input ?? "") }); }
    },
    resize(cols, rows) { send({ type: "resize", cols, rows }); },
    setRendererAttached(attached) {
      return send({ type: "renderer_attached", attached: Boolean(attached) });
    },
    assign({ assignmentId, data, timeoutMs = 30_000 }) {
      const messageId = createHash("sha256")
        .update(`${terminalId}:${assignmentId}:${Date.now()}:${Math.random()}`)
        .digest("hex")
        .slice(0, 24);
      return new Promise((resolve) => {
        const timer = setTimeout(() => {
          pendingAssignments.delete(messageId);
          const queuedIndex = queued.findIndex((item) => item?.messageId === messageId);
          if (queuedIndex >= 0) queued.splice(queuedIndex, 1);
          send({ type: "assignment_cancel", messageId, assignmentId });
          resolve({
            type: "assignment_ack",
            messageId,
            assignmentId,
            state: "timed-out",
            reason: "The terminal worker did not acknowledge the assignment in time."
          });
        }, Math.max(100, Math.min(30_000, Number(timeoutMs) || 30_000)));
        pendingAssignments.set(messageId, { resolve, timer });
        if (!send({ type: "assign", messageId, assignmentId, data })) {
          clearTimeout(timer);
          pendingAssignments.delete(messageId);
          resolve({
            type: "assignment_ack",
            messageId,
            assignmentId,
            state: "rejected",
            reason: "Terminal worker is not running."
          });
        }
      });
    },
    kill(signal = "SIGTERM") {
      closing = true;
      if (socketReady()) {
        clearTimeout(retryTimer);
        socket.write(`${JSON.stringify({ type: "close", signal })}\n`);
        stopped = true;
        socket.end();
      } else {
        queued.push({ type: "close", signal });
        if (!socket && !retryTimer) {
          retryTimer = setTimeout(connect, 0);
          retryTimer.unref?.();
        }
      }
    },
    disconnect() {
      stopped = true;
      clearTimeout(retryTimer);
      socket?.destroy();
      for (const [messageId, pendingAssignment] of pendingAssignments) {
        clearTimeout(pendingAssignment.timer);
        pendingAssignment.resolve({
          type: "assignment_ack",
          messageId,
          state: "rejected",
          reason: "Terminal worker connection closed."
        });
      }
      pendingAssignments.clear();
    }
  };
}

export function listPersistentAiTerminalSessions() {
  mkdirSync(sessionRoot, { recursive: true, mode: 0o700 });
  const records = [];
  for (const name of readdirSync(sessionRoot)) {
    const dir = join(sessionRoot, name);
    const config = readJson(join(dir, "config.json"));
    const state = readJson(join(dir, "state.json"));
    if (!config?.terminalId || !state) continue;
    const alive = processIsAlive(state.pid);
    records.push({
      config,
      state: {
        ...state,
        status: alive ? state.status : "exited",
        exitCode: alive ? state.exitCode : state.exitCode ?? null
      },
      output: readTail(join(dir, "output.log"), 50_000)
    });
  }
  return records.sort((left, right) => String(left.state.createdAt).localeCompare(String(right.state.createdAt)));
}

export function removePersistentAiTerminalSession(terminalId) {
  rmSync(persistentTerminalPaths(terminalId).dir, { recursive: true, force: true });
}

export function updatePersistentAiTerminalSession(terminalId, patch = {}) {
  const paths = persistentTerminalPaths(terminalId);
  const config = readJson(paths.config);
  if (!config) return false;
  if (Object.prototype.hasOwnProperty.call(patch, "title")) {
    config.title = String(patch.title || "").slice(0, 72);
  }
  if (Object.prototype.hasOwnProperty.call(patch, "model")) {
    config.model = String(patch.model || "").trim().slice(0, 140);
  }
  writeFileSync(paths.config, JSON.stringify(config, null, 2), { mode: 0o600 });
  return true;
}

export function persistentTerminalPaths(terminalId) {
  const key = createHash("sha256").update(String(terminalId || "")).digest("hex").slice(0, 24);
  const dir = join(sessionRoot, key);
  return {
    dir,
    config: join(dir, "config.json"),
    state: join(dir, "state.json"),
    output: join(dir, "output.log"),
    workerLog: join(dir, "worker.log"),
    socket: join(dir, "worker.sock")
  };
}

function handleWorkerMessage(line, handlers) {
  let payload;
  try { payload = JSON.parse(line); } catch { return null; }
  if (payload.type === "snapshot") handlers.onSnapshot?.(payload);
  if (payload.type === "output") handlers.onData?.(String(payload.data || ""), {
    assignmentId: String(payload.assignmentId || ""),
    emittedAt: String(payload.emittedAt || "")
  });
  if (payload.type === "exit") handlers.onExit?.({
    code: payload.code ?? null,
    signal: payload.signal || ""
  });
  return payload;
}

function serializableConfig(config) {
  return {
    runtimeVersion: AI_TERMINAL_RUNTIME_VERSION,
    geminiProfileVersion: config.launchPlan?.runtimeId === "gemini"
      ? AI_TERMINAL_GEMINI_PROFILE_VERSION
      : undefined,
    launchPlan: config.launchPlan,
    agent: config.agent,
    requestedModel: config.requestedModel,
    model: config.model,
    autoRouting: config.autoRouting,
    reasoningEffort: config.reasoningEffort,
    permissionMode: config.permissionMode,
    sandboxMode: config.sandboxMode,
    roleInstructions: config.roleInstructions,
    team: config.team,
    tokenMode: config.tokenMode,
    projectId: config.projectId,
    workspaceMode: config.workspaceMode,
    branchName: config.branchName,
    workspacePath: config.workspacePath,
    repositoryRoot: config.repositoryRoot,
    workspaceNotice: config.workspaceNotice,
    memoryInstructions: config.memoryInstructions,
    terminalGatewayToken: config.terminalGatewayToken,
    terminalId: config.terminalId,
    title: config.title,
    cwd: config.cwd,
    cols: config.cols,
    rows: config.rows,
    createdAt: config.createdAt || new Date().toISOString()
  };
}

export function persistentAiTerminalConfigIsCurrent(config = {}) {
  if (config.agent === "shell") return true;
  if (Number(config.runtimeVersion) !== AI_TERMINAL_RUNTIME_VERSION) return false;
  if (
    config.team
    && Number(config.team.contractVersion) !== TERMINAL_TEAM_ROLE_CONTRACT_VERSION
  ) return false;
  if (
    config.launchPlan?.runtimeId === "gemini"
    && Number(config.geminiProfileVersion) !== AI_TERMINAL_GEMINI_PROFILE_VERSION
  ) return false;
  return Number(config.launchPlan?.launchContractVersion) === AI_TERMINAL_LAUNCH_CONTRACT_VERSION;
}

function readJson(path) {
  try { return JSON.parse(readFileSync(path, "utf8")); } catch { return null; }
}

function readTail(path, limit) {
  try { return readFileSync(path, "utf8").slice(-limit); } catch { return ""; }
}

function persistentStartupError(output, state) {
  const text = String(output || "");
  const contractMismatch = /mismatched billing or model metadata|stale launch contract/i.test(text);
  const error = new Error(contractMismatch
    ? "Vibyra Desktop changed while this terminal was starting. Reopen the terminal after the desktop bridge refreshes."
    : "The AI provider could not start.");
  error.code = contractMismatch
    ? "terminal_launch_contract_mismatch"
    : "terminal_provider_startup_failed";
  error.status = 409;
  error.exitCode = state?.exitCode ?? null;
  return error;
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function processIsAlive(pid) {
  if (!Number.isInteger(Number(pid)) || Number(pid) <= 0) return false;
  try {
    process.kill(Number(pid), 0);
    return true;
  } catch {
    return false;
  }
}
