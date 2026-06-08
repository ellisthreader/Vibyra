import { createHash } from "node:crypto";
import { closeSync, mkdirSync, openSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createConnection } from "node:net";
import { spawn } from "node:child_process";

const moduleDir = dirname(fileURLToPath(import.meta.url));
const workerPath = join(moduleDir, "aiTerminalWorker.mjs");
const sessionRoot = process.env.VIBYRA_TERMINAL_SESSION_ROOT
  || join(homedir(), ".vibyra-agent", "terminal-sessions");

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

  const send = (payload) => {
    if (!socket?.writable) {
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
      while (queued.length && socket.writable) {
        socket.write(`${JSON.stringify(queued.shift())}\n`);
      }
      if (closing) stopped = true;
    });
    socket.on("data", (chunk) => {
      pending += chunk;
      const lines = pending.split("\n");
      pending = lines.pop() || "";
      for (const line of lines) {
        const type = handleWorkerMessage(line, handlers);
        if (type === "exit") stopped = true;
      }
    });
    socket.on("error", () => {});
    socket.on("close", () => {
      socket = null;
      if (!stopped && options.waitForWorker && retryCount < 40) {
        retryCount += 1;
        retryTimer = setTimeout(connect, Math.min(1000, 50 * retryCount));
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
    kill(signal = "SIGTERM") {
      closing = true;
      if (socket?.writable) {
        clearTimeout(retryTimer);
        socket.write(`${JSON.stringify({ type: "close", signal })}\n`);
        stopped = true;
        socket.end();
      } else {
        queued.push({ type: "close", signal });
        if (!socket && !retryTimer) retryTimer = setTimeout(connect, 0);
      }
    },
    disconnect() {
      stopped = true;
      clearTimeout(retryTimer);
      socket?.destroy();
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
  try { payload = JSON.parse(line); } catch { return ""; }
  if (payload.type === "snapshot") handlers.onSnapshot?.(payload);
  if (payload.type === "output") handlers.onData?.(String(payload.data || ""));
  if (payload.type === "exit") handlers.onExit?.({
    code: payload.code ?? null,
    signal: payload.signal || ""
  });
  return payload.type || "";
}

function serializableConfig(config) {
  return {
    agent: config.agent,
    model: config.model,
    reasoningEffort: config.reasoningEffort,
    permissionMode: config.permissionMode,
    tokenMode: config.tokenMode,
    projectId: config.projectId,
    workspaceMode: config.workspaceMode,
    branchName: config.branchName,
    workspacePath: config.workspacePath,
    repositoryRoot: config.repositoryRoot,
    workspaceNotice: config.workspaceNotice,
    terminalId: config.terminalId,
    title: config.title,
    cwd: config.cwd,
    cols: config.cols,
    rows: config.rows,
    createdAt: config.createdAt || new Date().toISOString()
  };
}

function readJson(path) {
  try { return JSON.parse(readFileSync(path, "utf8")); } catch { return null; }
}

function readTail(path, limit) {
  try { return readFileSync(path, "utf8").slice(-limit); } catch { return ""; }
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
