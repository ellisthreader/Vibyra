import { appendFileSync, existsSync, readFileSync, rmSync, statSync, truncateSync, unlinkSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { dirname, join } from "node:path";
import { spawnAiTerminalProcess } from "./aiTerminalProcess.mjs";

const configPath = process.argv[2];
if (!configPath || !existsSync(configPath)) process.exit(2);

const dir = dirname(configPath);
const config = JSON.parse(readFileSync(configPath, "utf8"));
const paths = {
  state: join(dir, "state.json"),
  output: join(dir, "output.log"),
  socket: join(dir, "worker.sock")
};
const clients = new Set();
let closing = false;
let child = null;
let state = {
  status: "starting",
  pid: process.pid,
  childPid: null,
  exitCode: null,
  signal: "",
  createdAt: config.createdAt || new Date().toISOString(),
  updatedAt: new Date().toISOString()
};

try { unlinkSync(paths.socket); } catch {}
writeState();

const server = createServer((socket) => {
  clients.add(socket);
  socket.setEncoding("utf8");
  send(socket, { type: "snapshot", state, output: readOutput() });
  let pending = "";
  socket.on("data", (chunk) => {
    pending += chunk;
    const lines = pending.split("\n");
    pending = lines.pop() || "";
    for (const line of lines) handleMessage(line);
  });
  const remove = () => clients.delete(socket);
  socket.on("close", remove);
  socket.on("error", remove);
});

server.listen(paths.socket, () => {
  child = spawnAiTerminalProcess({
    ...config,
    onData: handleOutput,
    onExit: handleExit
  });
  state = {
    ...state,
    status: "running",
    childPid: child?.pid || null,
    updatedAt: new Date().toISOString()
  };
  writeState();
});

process.on("SIGHUP", () => {});
process.on("SIGTERM", () => stopChild("SIGTERM"));
process.on("SIGINT", () => stopChild("SIGINT"));
process.on("uncaughtException", failWorker);
process.on("unhandledRejection", failWorker);

function handleMessage(line) {
  let payload;
  try { payload = JSON.parse(line); } catch { return; }
  if (payload.type === "input" && child?.stdin?.writable) child.stdin.write(String(payload.data ?? ""));
  if (payload.type === "resize") {
    try { child?.resize?.(payload.cols, payload.rows); } catch {}
  }
  if (payload.type === "close") {
    closing = true;
    stopChild(payload.signal || "SIGTERM");
  }
}

function handleOutput(data) {
  const value = String(data || "");
  appendFileSync(paths.output, value);
  trimOutput();
  state = { ...state, status: "running", updatedAt: new Date().toISOString() };
  writeState();
  broadcast({ type: "output", data: value });
}

function handleExit({ code, signal }) {
  state = {
    ...state,
    status: "exited",
    childPid: null,
    exitCode: Number.isFinite(Number(code)) ? Number(code) : null,
    signal: signal || "",
    updatedAt: new Date().toISOString()
  };
  writeState();
  broadcast({ type: "exit", code: state.exitCode, signal: state.signal });
  setTimeout(shutdown, 100);
}

function stopChild(signal) {
  if (!child) return shutdown();
  try { child.kill(signal); } catch { shutdown(); }
}

function shutdown() {
  for (const socket of clients) socket.end();
  server.close(() => {
    try { unlinkSync(paths.socket); } catch {}
    if (closing) rmSync(dir, { recursive: true, force: true });
    process.exit(0);
  });
}

function broadcast(payload) {
  for (const socket of clients) send(socket, payload);
}

function send(socket, payload) {
  if (socket.writable) socket.write(`${JSON.stringify(payload)}\n`);
}

function writeState() {
  writeFileSync(paths.state, JSON.stringify(state, null, 2), { mode: 0o600 });
}

function readOutput() {
  try { return readFileSync(paths.output, "utf8").slice(-50_000); } catch { return ""; }
}

function trimOutput() {
  try {
    if (statSync(paths.output).size <= 1_000_000) return;
    const tail = readOutput();
    truncateSync(paths.output, 0);
    appendFileSync(paths.output, tail);
  } catch {}
}

function failWorker(error) {
  const message = error instanceof Error ? error.stack || error.message : String(error);
  try { appendFileSync(paths.output, `\r\n[Terminal worker error]\r\n${message}\r\n`); } catch {}
  state = {
    ...state,
    status: "exited",
    childPid: null,
    exitCode: 1,
    signal: "",
    updatedAt: new Date().toISOString()
  };
  try { writeState(); } catch {}
  setTimeout(shutdown, 10);
}
