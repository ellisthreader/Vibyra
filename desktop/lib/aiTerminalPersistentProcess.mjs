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
  let connected = false;
  let stopped = false;
  let closing = false;
  let retryTimer = null;
  let retryCount = 0;
  const queued = [];
  const queue = (payload) => {
    if (payload.type === "resize") {
      const previous = queued.findLastIndex((item) => item.type === "resize");
      if (previous >= 0) queued.splice(previous, 1);
    }
    queued.push(payload);
  };
  const send = (payload) => {
    if (stopped || (closing && payload.type !== "close")) return false;
    if (!connected || !socket?.writable) {
      queue(payload);
      return true;
    }
    socket.write(`${JSON.stringify(payload)}\n`);
    return true;
  };
  const scheduleConnect = (delay) => {
    clearTimeout(retryTimer);
    retryTimer = setTimeout(() => {
      retryTimer = null;
      connect();
    }, delay);
  };
  const connect = () => {
    if (stopped || socket) return;
    const nextSocket = createConnection(paths.socket);
    socket = nextSocket;
    connected = false;
    let pending = "";
    nextSocket.setEncoding("utf8");
    nextSocket.on("connect", () => {
      if (socket !== nextSocket || stopped) return nextSocket.destroy();
      connected = true;
      retryCount = 0;
      nextSocket.write(`${JSON.stringify({ type: "attach" })}\n`);
      while (queued.length && nextSocket.writable) {
        nextSocket.write(`${JSON.stringify(queued.shift())}\n`);
      }
      if (closing) {
        stopped = true;
        nextSocket.end();
      }
    });
    nextSocket.on("data", (chunk) => {
      pending += chunk;
      const lines = pending.split("\n");
      pending = lines.pop() || "";
      for (const line of lines) {
        const type = handleWorkerMessage(line, handlers);
        if (type === "exit") stopped = true;
      }
    });
    nextSocket.on("error", () => {});
    nextSocket.on("close", () => {
      if (socket !== nextSocket) return;
      socket = null;
      connected = false;
      if (!stopped && (options.waitForWorker || closing) && retryCount < 40) {
        retryCount += 1;
        scheduleConnect(Math.min(1000, 50 * retryCount));
      }
    });
  };
  connect();
  return {
    stdin: {
      get writable() { return !stopped && !closing; },
      write(input) { return send({ type: "input", data: String(input ?? "") }); }
    },
    resize(cols, rows) { send({ type: "resize", cols, rows }); },
    kill(signal = "SIGTERM") {
      if (signal === "SIGWINCH") return true;
      if (stopped || closing) return false;
      closing = true;
      if (connected && socket?.writable) {
        clearTimeout(retryTimer);
        socket.write(`${JSON.stringify({ type: "close", signal })}\n`);
        stopped = true;
        socket.end();
      } else {
        queue({ type: "close", signal });
        if (!socket && !retryTimer) scheduleConnect(0);
      }
      return true;
    },
    disconnect() {
      stopped = true;
      connected = false;
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
    dir, config: join(dir, "config.json"), state: join(dir, "state.json"),
    output: join(dir, "output.log"), workerLog: join(dir, "worker.log"),
    socket: join(dir, "worker.sock")
  };
}
function handleWorkerMessage(line, handlers) {
  let payload;
  try { payload = JSON.parse(line); } catch { return ""; }
  if (payload.type === "snapshot") handlers.onSnapshot?.(payload);
  if (payload.type === "output") handlers.onData?.(String(payload.data || ""));
  if (payload.type === "exit") handlers.onExit?.({ code: payload.code ?? null, signal: payload.signal || "" });
  return payload.type || "";
}
function serializableConfig(config) {
  const result = {};
  for (const key of ["agent", "model", "reasoningEffort", "permissionMode", "tokenMode", "projectId", "terminalId", "title", "jobId", "jobRole", "initialPrompt", "cwd", "cols", "rows"]) {
    result[key] = config[key];
  }
  result.createdAt = config.createdAt || new Date().toISOString();
  return result;
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
