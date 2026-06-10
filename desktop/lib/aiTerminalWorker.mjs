import { appendFileSync, existsSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { appendFile, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { dirname, join } from "node:path";
import { spawnAiTerminalProcess } from "./aiTerminalProcess.mjs";
import { providerActivitySignal } from "./aiTerminalActivity.mjs";
import { prepareAiTerminalMemoryFiles } from "./aiTerminalMemoryFiles.mjs";
import { terminalStartupProbeResponder } from "./aiTerminalProbeResponse.mjs";
import { renewTerminalGatewayToken } from "./terminalGatewayAuth.mjs";

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
const assignmentRecords = new Map();
const queuedAssignments = [];
const pendingOutputAssignmentIds = [];
let outputTail = readOutputFile();
let pendingOutput = "";
let outputFlushTimer = null;
let outputWriteQueue = Promise.resolve();
let stateWriteTimer = null;
let closing = false;
let child = null;
let providerOutputTail = "";
let providerBusyObserved = false;
const gatewayRenewalTimer = startGatewayTokenRenewal(config.terminalGatewayToken);
const startupProbeResponder = terminalStartupProbeResponder(config);
let state = {
  status: "starting",
  providerState: "starting",
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
    for (const line of lines) handleMessage(line, socket);
  });
  const remove = () => clients.delete(socket);
  socket.on("close", remove);
  socket.on("error", remove);
});

server.listen(paths.socket, () => {
  const memoryFiles = prepareAiTerminalMemoryFiles(dir, config.memoryInstructions);
  child = spawnAiTerminalProcess({
    ...config,
    ...memoryFiles,
    onData: handleOutput,
    onExit: handleExit
  });
  state = {
    ...state,
    status: "running",
    providerState: config.agent === "shell" ? "fallback-shell" : "starting",
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

function handleMessage(line, socket) {
  let payload;
  try { payload = JSON.parse(line); } catch { return; }
  if (payload.type === "input" && child?.stdin?.writable) {
    const input = String(payload.data ?? "");
    if (/[\r\n]/.test(input) && state.providerState === "ready") beginProviderWork();
    child.stdin.write(input);
  }
  if (payload.type === "assign") handleAssignment(socket, payload);
  if (payload.type === "assignment_cancel") cancelAssignment(payload);
  if (payload.type === "resize") {
    startupProbeResponder.setDimensions(payload.cols, payload.rows);
    try { child?.resize?.(payload.cols, payload.rows); } catch {}
  }
  if (payload.type === "renderer_attached") {
    startupProbeResponder.setRendererAttached(payload.attached);
  }
  if (payload.type === "close") {
    closing = true;
    stopChild(payload.signal || "SIGTERM");
  }
}

function handleOutput(data) {
  const probe = startupProbeResponder.filter(data);
  if (probe.response && child?.stdin?.writable) child.stdin.write(probe.response);
  const value = probe.output;
  if (!value) return;
  const assignmentId = value.trim() ? pendingOutputAssignmentIds.shift() || "" : "";
  providerOutputTail = (providerOutputTail + value).slice(-4000);
  if (/\bexited\. Project shell ready\./.test(providerOutputTail)) {
    setProviderState("fallback-shell");
    rejectQueuedAssignments("The AI provider exited and this terminal is now a project shell.");
  }
  queueOutputWrite(value);
  state = { ...state, status: "running", updatedAt: new Date().toISOString() };
  scheduleStateWrite();
  broadcast({
    type: "output",
    data: value,
    ...(assignmentId ? { assignmentId } : {}),
    emittedAt: new Date().toISOString()
  });
  const activitySignal = providerActivitySignal(config.agent, providerOutputTail);
  if (state.providerState === "starting" && activitySignal === "ready") {
    setProviderState("ready");
    flushQueuedAssignments();
    return;
  }
  if (state.providerState === "busy" && value.trim() && activitySignal !== "ready") {
    providerBusyObserved = true;
  }
  if (state.providerState === "busy" && activitySignal === "ready"
    && providerBusyObserved) {
    providerBusyObserved = false;
    setProviderState("ready");
    flushQueuedAssignments();
  }
}

function handleExit({ code, signal }) {
  const pendingProbeOutput = startupProbeResponder.flush();
  if (pendingProbeOutput) handleOutput(pendingProbeOutput);
  rejectQueuedAssignments("The AI provider has exited.");
  state = {
    ...state,
    status: "exited",
    providerState: "exited",
    childPid: null,
    exitCode: Number.isFinite(Number(code)) ? Number(code) : null,
    signal: signal || "",
    updatedAt: new Date().toISOString()
  };
  writeState();
  broadcast({ type: "exit", code: state.exitCode, signal: state.signal });
  setTimeout(shutdown, 100);
}

function handleAssignment(socket, payload) {
  const assignmentId = String(payload.assignmentId || "").trim();
  const messageId = String(payload.messageId || "").trim();
  const data = String(payload.data ?? "");
  if (!assignmentId || !messageId || !data) {
    sendAssignmentAck(socket, { assignmentId, messageId }, "rejected", "Assignment ID and prompt are required.");
    return;
  }
  const existing = assignmentRecords.get(assignmentId);
  if (existing && existing.data !== data) {
    sendAssignmentAck(socket, payload, "rejected", "That assignment ID was already used for a different prompt.");
    return;
  }
  if (existing?.state === "written-to-child") {
    sendAssignmentAck(socket, payload, existing.state, "", true);
    return;
  }
  if (existing?.state === "writing" || existing?.state === "queued") {
    existing.waiters.push({ socket, messageId });
    return;
  }
  if (state.providerState === "fallback-shell" || state.providerState === "exited") {
    sendAssignmentAck(socket, payload, "rejected", providerRejectionReason());
    return;
  }
  const record = {
    assignmentId,
    data,
    state: "queued",
    waiters: [{ socket, messageId }]
  };
  assignmentRecords.set(assignmentId, record);
  queuedAssignments.push(record);
  flushQueuedAssignments();
}

function flushQueuedAssignments() {
  if (!child?.stdin?.writable || state.providerState !== "ready") return;
  while (queuedAssignments.length && state.providerState === "ready") {
    const record = queuedAssignments.shift();
    if (!record || assignmentRecords.get(record.assignmentId) !== record) continue;
    record.state = "writing";
    beginProviderWork();
    pendingOutputAssignmentIds.push(record.assignmentId);
    writeAssignmentData(record.data, (error) => {
      if (error) {
        const pendingIndex = pendingOutputAssignmentIds.indexOf(record.assignmentId);
        if (pendingIndex >= 0) pendingOutputAssignmentIds.splice(pendingIndex, 1);
        providerBusyObserved = false;
        setProviderState("ready");
        assignmentRecords.delete(record.assignmentId);
        acknowledgeRecord(record, "rejected", error.message || "The terminal rejected the assignment.");
        flushQueuedAssignments();
        return;
      }
      record.state = "written-to-child";
      acknowledgeRecord(record, "written-to-child");
      trimAssignmentRecords();
    });
  }
}

function writeAssignmentData(data, callback) {
  const bracketedPasteSubmit = "\x1b[201~\r";
  if (!data.endsWith(bracketedPasteSubmit)) {
    child.stdin.write(data, callback);
    return;
  }
  const paste = data.slice(0, -1);
  child.stdin.write(paste, (pasteError) => {
    if (pasteError) {
      callback(pasteError);
      return;
    }
    const submitDelayMs = config.launchPlan?.runtimeId === "gemini" ? 750 : 100;
    setTimeout(() => child.stdin.write("\r", callback), submitDelayMs);
  });
}

function beginProviderWork() {
  providerBusyObserved = false;
  providerOutputTail = "";
  setProviderState("busy");
}

function setProviderState(providerState) {
  if (state.providerState === providerState) return;
  state = { ...state, providerState, updatedAt: new Date().toISOString() };
  writeState();
  broadcast({ type: "snapshot", state, output: "" });
}

function cancelAssignment(payload) {
  const record = assignmentRecords.get(String(payload.assignmentId || ""));
  if (!record || record.state !== "queued") return;
  record.waiters = record.waiters.filter((waiter) => waiter.messageId !== String(payload.messageId || ""));
  if (record.waiters.length) return;
  assignmentRecords.delete(record.assignmentId);
  const index = queuedAssignments.indexOf(record);
  if (index >= 0) queuedAssignments.splice(index, 1);
}

function rejectQueuedAssignments(reason) {
  while (queuedAssignments.length) {
    const record = queuedAssignments.shift();
    if (!record || record.state !== "queued") continue;
    assignmentRecords.delete(record.assignmentId);
    acknowledgeRecord(record, "rejected", reason);
  }
}

function acknowledgeRecord(record, assignmentState, reason = "") {
  for (const waiter of record.waiters.splice(0)) {
    sendAssignmentAck(waiter.socket, {
      assignmentId: record.assignmentId,
      messageId: waiter.messageId
    }, assignmentState, reason);
  }
}

function sendAssignmentAck(socket, payload, assignmentState, reason = "", duplicate = false) {
  send(socket, {
    type: "assignment_ack",
    messageId: payload.messageId,
    assignmentId: payload.assignmentId,
    state: assignmentState,
    providerState: state.providerState,
    duplicate,
    ...(reason ? { reason } : {})
  });
}

function providerRejectionReason() {
  return state.providerState === "fallback-shell"
    ? "The AI provider exited and this terminal is now a project shell."
    : "The AI provider has exited.";
}

function trimAssignmentRecords() {
  if (assignmentRecords.size <= 256) return;
  for (const [assignmentId, record] of assignmentRecords) {
    if (record.state === "written-to-child") assignmentRecords.delete(assignmentId);
    if (assignmentRecords.size <= 192) break;
  }
}

function stopChild(signal) {
  if (!child) return shutdown();
  try { child.kill(signal); } catch { shutdown(); }
}

function shutdown() {
  if (gatewayRenewalTimer) clearInterval(gatewayRenewalTimer);
  flushOutputWrites();
  flushStateWrite();
  for (const socket of clients) socket.end();
  server.close(() => {
    outputWriteQueue.finally(() => {
      try { unlinkSync(paths.socket); } catch {}
      if (closing) rmSync(dir, { recursive: true, force: true });
      process.exit(0);
    });
  });
}

function startGatewayTokenRenewal(token) {
  const value = String(token || "").trim();
  if (!value) return null;
  renewTerminalGatewayToken(value);
  const timer = setInterval(() => renewTerminalGatewayToken(value), 6 * 60 * 60 * 1000);
  timer.unref?.();
  return timer;
}

function broadcast(payload) {
  for (const socket of clients) send(socket, payload);
}

function send(socket, payload) {
  if (socket.writable) socket.write(`${JSON.stringify(payload)}\n`);
}

function writeState() {
  clearTimeout(stateWriteTimer);
  stateWriteTimer = null;
  writeFileSync(paths.state, JSON.stringify(state, null, 2), { mode: 0o600 });
}

function readOutput() {
  return outputTail.slice(-50_000);
}

function readOutputFile() {
  try { return readFileSync(paths.output, "utf8").slice(-1_000_000); } catch { return ""; }
}

function queueOutputWrite(value) {
  outputTail = `${outputTail}${value}`.slice(-1_000_000);
  pendingOutput += value;
  if (pendingOutput.length >= 16_384) {
    flushOutputWrites();
    return;
  }
  if (!outputFlushTimer) {
    outputFlushTimer = setTimeout(flushOutputWrites, 24);
    outputFlushTimer.unref?.();
  }
}

function flushOutputWrites() {
  clearTimeout(outputFlushTimer);
  outputFlushTimer = null;
  const chunk = pendingOutput;
  pendingOutput = "";
  if (!chunk) return outputWriteQueue;
  const snapshot = outputTail;
  outputWriteQueue = outputWriteQueue
    .then(() => appendFile(paths.output, chunk, { mode: 0o600 }))
    .then(() => {
      if (Buffer.byteLength(snapshot) < 1_000_000) return;
      return writeFile(paths.output, snapshot, { mode: 0o600 });
    })
    .catch((error) => failWorker(error));
  return outputWriteQueue;
}

function scheduleStateWrite() {
  if (stateWriteTimer) return;
  stateWriteTimer = setTimeout(() => {
    stateWriteTimer = null;
    writeState();
  }, 50);
  stateWriteTimer.unref?.();
}

function flushStateWrite() {
  if (!stateWriteTimer) return;
  writeState();
}

function failWorker(error) {
  clearTimeout(outputFlushTimer);
  clearTimeout(stateWriteTimer);
  const message = error instanceof Error ? error.stack || error.message : String(error);
  try {
    appendFileSync(paths.output, `${pendingOutput}\r\n[Terminal worker error]\r\n${message}\r\n`);
    pendingOutput = "";
  } catch {}
  state = {
    ...state,
    status: "exited",
    providerState: "exited",
    childPid: null,
    exitCode: 1,
    signal: "",
    updatedAt: new Date().toISOString()
  };
  try { writeState(); } catch {}
  setTimeout(shutdown, 10);
}
