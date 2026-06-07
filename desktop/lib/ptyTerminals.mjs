import { randomUUID, createHash } from "node:crypto";
import { projectById } from "./projects.mjs";
import { readBody, send } from "./http.mjs";
import { aiTerminalAgentStatus, listAiTerminalAgentStatuses } from "./aiTerminalProcess.mjs";
import {
  connectPersistentAiTerminalProcess,
  launchPersistentAiTerminalProcess,
  listPersistentAiTerminalSessions,
  removePersistentAiTerminalSession
} from "./aiTerminalPersistentProcess.mjs";

export const MAX_PTY_TERMINAL_SESSIONS = 12;

const MAX_OUTPUT_BUFFER = 50_000;
const MAX_WEBSOCKET_MESSAGE_BYTES = 1_000_000;
const agents = new Set(["shell", "vibyra", "codex", "claude", "gemini"]);
const sessions = new Map();
const subscribers = new Map();

restorePersistentSessions();

export async function handlePtyTerminalRoutes(req, res, url) {
  const route = ptyRoute(url.pathname);
  if (!route) return false;
  if (req.method === "GET" && route.action === "collection") {
    send(res, 200, { sessions: listPtyTerminals(), agents: listAiTerminalAgentStatuses() });
    return true;
  }
  if (req.method === "POST" && route.action === "collection") {
    send(res, 200, { session: createPtyTerminal(await readBody(req)), agents: listAiTerminalAgentStatuses() });
    return true;
  }
  if (req.method === "POST" && route.action === "input") {
    await writePtyInput(route.id, String((await readBody(req))?.input ?? ""));
    send(res, 200, { ok: true });
    return true;
  }
  if (req.method === "POST" && route.action === "resize") {
    await resizePtyTerminal(route.id, await readBody(req), { requireRunning: true });
    send(res, 200, { ok: true });
    return true;
  }
  if (req.method === "POST" && route.action === "close") {
    closePtyTerminal(route.id);
    send(res, 200, { ok: true, sessions: listPtyTerminals(), agents: listAiTerminalAgentStatuses() });
    return true;
  }
  return false;
}

export function handlePtyTerminalUpgrade(req, socket) {
  const url = new URL(req.url || "/", `http://${req.headers.host || "127.0.0.1"}`);
  const route = ptyRoute(url.pathname);
  if (!route || route.action !== "socket" || !isLoopback(req)) {
    socket.destroy();
    return;
  }
  const session = sessions.get(route.id);
  if (!session) {
    socket.destroy();
    return;
  }
  if (!acceptWebSocket(req, socket)) {
    socket.destroy();
    return;
  }
  let unsubscribe = () => {};
  let sendFailed = false;
  const sendMessage = (payload) => {
    if (sendFrame(socket, JSON.stringify(payload))) return;
    sendFailed = true;
    unsubscribe();
  };
  unsubscribe = subscribePtyTerminal(session.id, sendMessage);
  if (sendFailed) {
    unsubscribe();
    socket.destroy();
    return;
  }
  let pendingSocketData = Buffer.alloc(0);
  let frameState = emptyFrameState();
  let messageQueue = Promise.resolve();
  socket.on("data", (chunk) => {
    try {
      const incoming = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      if (pendingSocketData.length + incoming.length > MAX_WEBSOCKET_MESSAGE_BYTES + 14) {
        throw webSocketProtocolError("PTY WebSocket input exceeded the message limit.");
      }
      const parsed = parsePtyWebSocketFrames(Buffer.concat([pendingSocketData, incoming]), frameState);
      pendingSocketData = parsed.remaining;
      frameState = parsed.state;
      for (const pong of parsed.pongs) sendFrame(socket, pong, 10);
      for (const message of parsed.messages) {
        messageQueue = messageQueue.then(() => handlePtySocketMessage(session.id, message));
      }
      if (parsed.close) socket.end();
    } catch (error) {
      if (error?.code !== "PTY_WEBSOCKET_PROTOCOL") logPtyError(error);
      socket.destroy();
    }
  });
  socket.on("close", unsubscribe);
  socket.on("error", unsubscribe);
}

export function createPtyTerminal(body = {}) {
  const requestedId = string(body.id);
  const existing = requestedId ? sessions.get(requestedId) : null;
  if (existing && existing.status !== "exited") {
    void resizePtyTerminal(existing.id, body).catch(logUnexpectedPtyError);
    return publicSession(existing);
  }
  if (existing) closePtyTerminal(existing.id);
  if (sessions.size >= MAX_PTY_TERMINAL_SESSIONS) throw httpError(429, "Vibyra Desktop supports up to " + MAX_PTY_TERMINAL_SESSIONS + " terminals at once.");
  const projectId = string(body.projectId);
  const project = projectById(projectId);
  const model = string(body.model).slice(0, 140);
  const agent = normalizeAgent(body.agent);
  const agentStatus = aiTerminalAgentStatus(agent);
  const session = {
    id: requestedId || "pty-" + Date.now() + "-" + randomUUID().slice(0, 8),
    title: string(body.title).slice(0, 72) || "Terminal",
    jobId: normalizeJobMetadata(body.jobId, 120),
    jobRole: normalizeJobMetadata(body.jobRole, 40),
    agent,
    agentStatus,
    model,
    initialPrompt: normalizeInitialPrompt(body.initialPrompt),
    reasoningEffort: normalizeReasoningEffort(body.reasoningEffort || body.effort),
    permissionMode: normalizePermissionMode(body.permissionMode, agent),
    tokenMode: normalizeTokenMode(body.tokenMode),
    projectId,
    cwd: project?.path || process.cwd(),
    cols: clamp(body.cols, 100),
    rows: clamp(body.rows, 30),
    output: "",
    status: agentStatus.available ? "starting" : "unavailable",
    exitCode: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    process: null
  };
  sessions.set(session.id, session);
  if (!agentStatus.available) {
    appendOutput(session, `${label(session.agent)} CLI is not available.\r\n${agentStatus.installHint}\r\n`);
    return publicSession(session);
  }
  try {
    session.process = launchPersistentAiTerminalProcess({
      agent: session.agent,
      model: session.model,
      reasoningEffort: session.reasoningEffort,
      permissionMode: session.permissionMode,
      tokenMode: session.tokenMode,
      projectId: session.projectId,
      terminalId: session.id,
      title: session.title,
      jobId: session.jobId,
      jobRole: session.jobRole,
      initialPrompt: session.initialPrompt,
      cwd: session.cwd,
      cols: session.cols,
      rows: session.rows,
      createdAt: session.createdAt
    }, persistentHandlers(session));
  } catch (error) {
    sessions.delete(session.id);
    try { removePersistentAiTerminalSession(session.id); } catch {}
    throw error;
  }
  return publicSession(session);
}

function persistentHandlers(session) {
  const isCurrent = () => sessions.get(session.id) === session;
  return {
    onSnapshot: (payload) => {
      if (!isCurrent()) return;
      const output = String(payload.output || "").slice(-MAX_OUTPUT_BUFFER);
      const workerStatus = String(payload.state?.status || "");
      let changed = output !== session.output;
      if (workerStatus && workerStatus !== session.status) changed = true;
      if (payload.state?.exitCode !== undefined && payload.state.exitCode !== session.exitCode) changed = true;
      session.output = output;
      if (workerStatus) session.status = workerStatus;
      session.exitCode = payload.state?.exitCode ?? session.exitCode;
      session.updatedAt = payload.state?.updatedAt || session.updatedAt;
      if (workerStatus === "exited" && session.process) {
        const processHandle = session.process;
        session.process = null;
        processHandle.disconnect?.();
      }
      if (changed) publish(session.id, { type: "session", session: publicSession(session), output });
    },
    onData: (data) => {
      if (!isCurrent()) return;
      session.status = "running";
      appendOutput(session, data);
      publish(session.id, { type: "output", data });
    },
    onExit: ({ code, signal }) => {
      if (!isCurrent()) return;
      session.process = null;
      session.status = "exited";
      session.exitCode = Number.isFinite(Number(code)) ? Number(code) : null;
      const data = `\r\n[${label(session.agent)} exited${signal ? `: ${signal}` : session.exitCode !== null ? `: ${session.exitCode}` : ""}]\r\n`;
      appendOutput(session, data);
      publish(session.id, { type: "exit", data, code: session.exitCode, signal: signal || "" });
    }
  };
}

export function closePtyTerminal(id) {
  const session = sessions.get(string(id));
  if (!session) return;
  if (session.process) session.process.kill("SIGTERM");
  else removePersistentAiTerminalSession(session.id);
  sessions.delete(session.id);
  subscribers.delete(session.id);
}

function restorePersistentSessions() {
  const records = selectPersistentSessionRecords(listPersistentAiTerminalSessions());
  for (const record of records) {
    const config = record.config;
    const workerState = record.state;
    const agent = normalizeAgent(config.agent);
    const session = {
      id: string(config.terminalId),
      title: string(config.title).slice(0, 72) || "Recovered terminal",
      jobId: normalizeJobMetadata(config.jobId, 120),
      jobRole: normalizeJobMetadata(config.jobRole, 40),
      agent,
      agentStatus: aiTerminalAgentStatus(agent),
      model: string(config.model).slice(0, 140),
      initialPrompt: normalizeInitialPrompt(config.initialPrompt),
      reasoningEffort: normalizeReasoningEffort(config.reasoningEffort),
      permissionMode: normalizePermissionMode(config.permissionMode, agent),
      tokenMode: normalizeTokenMode(config.tokenMode),
      projectId: string(config.projectId),
      cwd: string(config.cwd) || process.cwd(),
      cols: clamp(config.cols, 100),
      rows: clamp(config.rows, 30),
      output: String(record.output || "").slice(-MAX_OUTPUT_BUFFER),
      status: String(workerState.status || "exited"),
      exitCode: workerState.exitCode ?? null,
      createdAt: config.createdAt || workerState.createdAt || new Date().toISOString(),
      updatedAt: workerState.updatedAt || new Date().toISOString(),
      process: null
    };
    if (!session.id || sessions.has(session.id)) continue;
    sessions.set(session.id, session);
    if (session.status !== "exited") {
      session.process = connectPersistentAiTerminalProcess(
        session.id,
        persistentHandlers(session),
        { waitForWorker: true }
      );
    }
  }
}

export function listPtyTerminals() {
  return Array.from(sessions.values()).map(publicSession);
}

async function writePtyInput(id, input) {
  const session = sessions.get(string(id));
  await writePtySessionInput(session, input);
}

async function resizePtyTerminal(id, size, options = {}) {
  const session = sessions.get(string(id));
  return resizePtySession(session, size, options);
}

export async function writePtySessionInput(session, input) {
  const stdin = session?.process?.stdin;
  if (!isPtySessionWritable(session)) throw httpError(409, "Terminal is not running.");
  let result;
  try {
    result = stdin.write(String(input ?? ""));
    if (result && typeof result.then === "function") result = await result;
  } catch (error) {
    if (isClosedPtyError(error) || !stdin.writable) {
      throw httpError(409, "Terminal is not running.");
    }
    throw error;
  }
  if (result === false && !stdin.writable) throw httpError(409, "Terminal is not running.");
  session.updatedAt = new Date().toISOString();
}

export async function resizePtySession(session, size, options = {}) {
  if (!session) {
    if (options.requireRunning) throw httpError(409, "Terminal is not running.");
    return false;
  }
  if (options.requireRunning && !isPtySessionWritable(session)) {
    throw httpError(409, "Terminal is not running.");
  }
  const resize = session.process?.resize;
  if (options.requireRunning && typeof resize !== "function") {
    throw httpError(409, "Terminal is not running.");
  }
  const cols = clamp(size?.cols, session.cols || 100);
  const rows = clamp(size?.rows, session.rows || 30);
  if (session.cols === cols && session.rows === rows) return false;
  let result;
  try {
    result = resize?.call(session.process, cols, rows);
    if (result && typeof result.then === "function") await result;
  } catch (error) {
    if (isClosedPtyError(error) || !session.process?.stdin?.writable) {
      throw httpError(409, "Terminal is not running.");
    }
    throw error;
  }
  if (result === false && !session.process?.stdin?.writable) {
    throw httpError(409, "Terminal is not running.");
  }
  session.cols = cols;
  session.rows = rows;
  session.updatedAt = new Date().toISOString();
  return true;
}

function subscribePtyTerminal(id, sendMessage) {
  const session = sessions.get(id);
  const list = subscribers.get(id) || new Set();
  list.add(sendMessage);
  subscribers.set(id, list);
  sendMessage({ type: "session", session: publicSession(session), output: session.output });
  return () => {
    list.delete(sendMessage);
    if (!list.size) subscribers.delete(id);
  };
}

export async function handlePtySocketMessage(id, message) {
  let payload = null;
  try { payload = JSON.parse(message); } catch { return; }
  try {
    if (payload?.type === "input") await writePtyInput(id, String(payload.data ?? ""));
    if (payload?.type === "resize") await resizePtyTerminal(id, payload, { requireRunning: true });
  } catch (error) {
    logUnexpectedPtyError(error);
  }
}

function ptyRoute(pathname) {
  if (pathname === "/desktop/pty-terminals" || pathname === "/desktop/pty-terminals/") return { action: "collection" };
  const parts = pathname.split("/").filter(Boolean);
  if (parts[0] !== "desktop" || parts[1] !== "pty-terminals") return null;
  if (parts.length === 4 && parts[3] === "socket") return { action: "socket", id: decodeURIComponent(parts[2]) };
  if (parts.length === 4) return { action: parts[3], id: decodeURIComponent(parts[2]) };
  return null;
}

function publicSession(session) {
  if (!session) return null;
  const { process, initialPrompt, ...safe } = session;
  return safe;
}

function appendOutput(session, data) {
  session.output = (session.output + String(data || "")).slice(-MAX_OUTPUT_BUFFER);
  session.updatedAt = new Date().toISOString();
}

function publish(id, payload) {
  const list = subscribers.get(id);
  if (!list) return;
  for (const sendMessage of [...list]) {
    try {
      sendMessage(payload);
    } catch (error) {
      list.delete(sendMessage);
      logPtyError(error);
    }
  }
  if (!list.size) subscribers.delete(id);
}

function acceptWebSocket(req, socket) {
  const key = req.headers["sec-websocket-key"];
  if (typeof key !== "string" || !key.trim() || !socket?.writable) return false;
  const accept = createHash("sha1").update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`).digest("base64");
  try {
    socket.write(["HTTP/1.1 101 Switching Protocols", "Upgrade: websocket", "Connection: Upgrade", `Sec-WebSocket-Accept: ${accept}`, "", ""].join("\r\n"));
    return true;
  } catch {
    return false;
  }
}

function sendFrame(socket, value, opcode = 1) {
  if (!socket?.writable || socket.destroyed || socket.writableEnded) return false;
  const body = Buffer.isBuffer(value) ? value : Buffer.from(value);
  let frame;
  if (body.length < 126) {
    frame = Buffer.concat([Buffer.from([0x80 | opcode, body.length]), body]);
  } else if (body.length <= 0xffff) {
    frame = Buffer.concat([Buffer.from([0x80 | opcode, 126, body.length >> 8, body.length & 255]), body]);
  } else {
    const head = Buffer.alloc(10);
    head[0] = 0x80 | opcode;
    head[1] = 127;
    head.writeBigUInt64BE(BigInt(body.length), 2);
    frame = Buffer.concat([head, body]);
  }
  try {
    socket.write(frame);
    return true;
  } catch {
    return false;
  }
}

export function parsePtyWebSocketFrames(buffer, state = emptyFrameState()) {
  const messages = [];
  const pongs = [];
  let offset = 0;
  let nextState = state;
  let close = false;
  while (offset + 2 <= buffer.length) {
    const first = buffer[offset];
    const second = buffer[offset + 1];
    const fin = Boolean(first & 0x80);
    const opcode = first & 0x0f;
    const masked = Boolean(second & 0x80);
    if (first & 0x70) throw webSocketProtocolError("PTY WebSocket extensions are not supported.");
    if (!masked) throw webSocketProtocolError("PTY WebSocket client frames must be masked.");
    if (![0, 1, 8, 9, 10].includes(opcode)) throw webSocketProtocolError("Unsupported PTY WebSocket frame.");
    if (opcode >= 8 && !fin) throw webSocketProtocolError("PTY WebSocket control frames cannot be fragmented.");
    let length = second & 0x7f;
    let cursor = offset + 2;
    if (length === 126) {
      if (cursor + 2 > buffer.length) break;
      length = buffer.readUInt16BE(cursor);
      cursor += 2;
    } else if (length === 127) {
      if (cursor + 8 > buffer.length) break;
      const bigLength = buffer.readBigUInt64BE(cursor);
      if (bigLength > BigInt(MAX_WEBSOCKET_MESSAGE_BYTES)) {
        throw webSocketProtocolError("PTY WebSocket input exceeded the message limit.");
      }
      length = Number(bigLength);
      cursor += 8;
    }
    if (length > MAX_WEBSOCKET_MESSAGE_BYTES || (opcode >= 8 && length > 125)) {
      throw webSocketProtocolError("PTY WebSocket frame exceeded its allowed size.");
    }
    const maskOffset = cursor;
    cursor += 4;
    if (cursor + length > buffer.length) break;
    const payload = Buffer.from(buffer.subarray(cursor, cursor + length));
    const mask = buffer.subarray(maskOffset, maskOffset + 4);
    for (let index = 0; index < payload.length; index += 1) payload[index] ^= mask[index % 4];
    if (opcode === 8) {
      close = true;
    } else if (opcode === 9) {
      pongs.push(payload);
    } else if (opcode === 0) {
      if (!nextState.fragmented) throw webSocketProtocolError("Unexpected PTY WebSocket continuation frame.");
      const bytes = nextState.bytes + payload.length;
      if (bytes > MAX_WEBSOCKET_MESSAGE_BYTES) throw webSocketProtocolError("PTY WebSocket input exceeded the message limit.");
      const fragments = [...nextState.fragments, payload];
      if (fin) {
        messages.push(decodeWebSocketText(Buffer.concat(fragments)));
        nextState = emptyFrameState();
      } else {
        nextState = { fragmented: true, fragments, bytes };
      }
    } else if (nextState.fragmented) {
      throw webSocketProtocolError("A PTY WebSocket message was interrupted.");
    } else if (fin) {
      messages.push(decodeWebSocketText(payload));
    } else {
      nextState = { fragmented: true, fragments: [payload], bytes: payload.length };
    }
    offset = cursor + length;
    if (close) break;
  }
  return { messages, pongs, close, remaining: buffer.subarray(offset), state: nextState };
}

export function selectPersistentSessionRecords(records, limit = MAX_PTY_TERMINAL_SESSIONS) {
  const selectedById = new Map();
  for (const record of records || []) {
    const id = string(record?.config?.terminalId);
    if (!id) continue;
    const current = selectedById.get(id);
    if (!current || sessionRecordPriority(record) < sessionRecordPriority(current)) {
      selectedById.set(id, record);
    }
  }
  return [...selectedById.values()]
    .sort((left, right) => {
      const priority = sessionRecordPriority(left) - sessionRecordPriority(right);
      if (priority) return priority;
      const leftTime = Date.parse(left.state?.updatedAt || left.state?.createdAt || left.config?.createdAt || "") || 0;
      const rightTime = Date.parse(right.state?.updatedAt || right.state?.createdAt || right.config?.createdAt || "") || 0;
      return priority === 0 && String(left.state?.status) === "exited"
        ? rightTime - leftTime
        : leftTime - rightTime;
    })
    .slice(0, Math.max(0, limit));
}

function emptyFrameState() {
  return { fragmented: false, fragments: [], bytes: 0 };
}

function decodeWebSocketText(payload) {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(payload);
  } catch {
    throw webSocketProtocolError("PTY WebSocket input was not valid UTF-8.");
  }
}

function webSocketProtocolError(message) {
  const error = new Error(message);
  error.code = "PTY_WEBSOCKET_PROTOCOL";
  return error;
}

function sessionRecordPriority(record) {
  return String(record?.state?.status || "exited") === "exited" ? 1 : 0;
}

function isPtySessionWritable(session) {
  if (!session?.process?.stdin) return false;
  if (["exited", "stopped", "unavailable"].includes(String(session.status))) return false;
  return session.process.stdin.writable !== false;
}

function isClosedPtyError(error) {
  return Number(error?.status) === 409
    || ["EPIPE", "ERR_STREAM_DESTROYED", "ERR_STREAM_WRITE_AFTER_END"].includes(String(error?.code || ""));
}

function logPtyError(error) {
  console.error(error instanceof Error ? error.stack || error.message : error);
}

function logUnexpectedPtyError(error) {
  if (Number(error?.status) !== 409) logPtyError(error);
}

function isLoopback(req) {
  const address = req.socket?.remoteAddress || "";
  return address === "127.0.0.1" || address === "::1" || address === "::ffff:127.0.0.1";
}

export function normalizePtyTerminalAgent(value) {
  const next = string(value).toLowerCase() || "vibyra";
  if (next === "official") return "vibyra";
  return agents.has(next) ? next : "vibyra";
}

function normalizeAgent(value) {
  return normalizePtyTerminalAgent(value);
}

function normalizeReasoningEffort(value) {
  const effort = string(value) || "medium";
  return ["low", "medium", "high", "xhigh", "none"].includes(effort) ? effort : "medium";
}

function normalizeTokenMode(value) {
  return string(value).toLowerCase() === "provider" ? "provider" : "vibyra";
}

function normalizeInitialPrompt(value) {
  return String(value ?? "").trim().slice(0, 12_000);
}

function normalizeJobMetadata(value, max) {
  return String(value ?? "").trim().replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, max);
}

function normalizePermissionMode(value, agent) {
  return agent === "codex" && string(value).toLowerCase() === "full" ? "full" : "standard";
}

function clamp(value, fallback) {
  const numeric = Number.parseInt(String(value || ""), 10);
  return Math.min(240, Math.max(10, Number.isFinite(numeric) ? numeric : fallback));
}

function label(agent) {
  return agent === "claude" ? "Claude" : agent === "gemini" ? "Gemini" : agent === "shell" ? "Shell" : agent === "codex" ? "Codex" : "Vibyra";
}

function string(value) {
  return String(value ?? "").trim();
}

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  throw error;
}
