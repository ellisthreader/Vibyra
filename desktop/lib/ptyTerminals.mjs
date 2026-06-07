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
    writePtyInput(route.id, String((await readBody(req))?.input ?? ""));
    send(res, 200, { ok: true });
    return true;
  }
  if (req.method === "POST" && route.action === "resize") {
    resizePtyTerminal(route.id, await readBody(req));
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
  acceptWebSocket(req, socket);
  const unsubscribe = subscribePtyTerminal(session.id, (payload) => sendFrame(socket, JSON.stringify(payload)));
  let pendingSocketData = Buffer.alloc(0);
  let pendingSocketFragments = [];
  socket.on("data", (chunk) => {
    try {
      const parsed = readFrames(Buffer.concat([pendingSocketData, chunk]), pendingSocketFragments);
      pendingSocketData = parsed.remaining;
      pendingSocketFragments = parsed.fragments;
      for (const message of parsed.messages) handlePtySocketMessage(session.id, message);
    } catch (error) {
      console.error(error instanceof Error ? error.stack || error.message : error);
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
    resizePtyTerminal(existing.id, body);
    return publicSession(existing);
  }
  if (existing) closePtyTerminal(existing.id);
  if (sessions.size >= MAX_PTY_TERMINAL_SESSIONS) throw httpError(429, "Vibyra Desktop supports up to " + MAX_PTY_TERMINAL_SESSIONS + " terminals at once.");
  const projectId = string(body.projectId);
  const project = projectById(projectId);
  const model = string(body.model).slice(0, 140);
  const agent = normalizeAgent(body.agent, model);
  const agentStatus = aiTerminalAgentStatus(agent);
  const session = {
    id: requestedId || "pty-" + Date.now() + "-" + randomUUID().slice(0, 8),
    title: string(body.title).slice(0, 72) || "Terminal",
    agent,
    agentStatus,
    model,
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
  session.process = launchPersistentAiTerminalProcess({
    agent: session.agent,
    model: session.model,
    reasoningEffort: session.reasoningEffort,
    permissionMode: session.permissionMode,
    tokenMode: session.tokenMode,
    projectId: session.projectId,
    terminalId: session.id,
    title: session.title,
    cwd: session.cwd,
    cols: session.cols,
    rows: session.rows,
    createdAt: session.createdAt
  }, persistentHandlers(session));
  return publicSession(session);
}

function persistentHandlers(session) {
  return {
    onSnapshot: (payload) => {
      const output = String(payload.output || "").slice(-MAX_OUTPUT_BUFFER);
      if (output && output !== session.output) {
        session.output = output;
        publish(session.id, { type: "session", session: publicSession(session), output });
      }
      const workerStatus = String(payload.state?.status || "");
      if (workerStatus) session.status = workerStatus;
      session.exitCode = payload.state?.exitCode ?? session.exitCode;
      session.updatedAt = payload.state?.updatedAt || session.updatedAt;
    },
    onData: (data) => {
      session.status = "running";
      appendOutput(session, data);
      publish(session.id, { type: "output", data });
    },
    onExit: ({ code, signal }) => {
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
  for (const record of listPersistentAiTerminalSessions().slice(0, MAX_PTY_TERMINAL_SESSIONS)) {
    const config = record.config;
    const workerState = record.state;
    const agent = normalizeAgent(config.agent, config.model);
    const session = {
      id: string(config.terminalId),
      title: string(config.title).slice(0, 72) || "Recovered terminal",
      agent,
      agentStatus: aiTerminalAgentStatus(agent),
      model: string(config.model).slice(0, 140),
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

function writePtyInput(id, input) {
  const session = sessions.get(string(id));
  if (!session?.process?.stdin?.writable) throw httpError(409, "Terminal is not running.");
  session.process.stdin.write(input);
  session.updatedAt = new Date().toISOString();
}

function resizePtyTerminal(id, size) {
  const session = sessions.get(string(id));
  if (!session) return;
  const cols = clamp(size?.cols, session.cols || 100);
  const rows = clamp(size?.rows, session.rows || 30);
  if (session.cols === cols && session.rows === rows) return;
  session.cols = cols;
  session.rows = rows;
  session.updatedAt = new Date().toISOString();
  try { session.process?.resize?.(cols, rows); } catch {}
  try { session.process?.kill?.("SIGWINCH"); } catch {}
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

export function handlePtySocketMessage(id, message) {
  let payload = null;
  try { payload = JSON.parse(message); } catch { return; }
  try {
    if (payload?.type === "input") writePtyInput(id, String(payload.data ?? ""));
    if (payload?.type === "resize") resizePtyTerminal(id, payload);
  } catch (error) {
    if (Number(error?.status) !== 409) {
      console.error(error instanceof Error ? error.stack || error.message : error);
    }
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
  const { process, ...safe } = session;
  return safe;
}

function appendOutput(session, data) {
  session.output = (session.output + String(data || "")).slice(-MAX_OUTPUT_BUFFER);
  session.updatedAt = new Date().toISOString();
}

function publish(id, payload) {
  for (const sendMessage of subscribers.get(id) || []) sendMessage(payload);
}

function acceptWebSocket(req, socket) {
  const key = req.headers["sec-websocket-key"];
  const accept = createHash("sha1").update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`).digest("base64");
  socket.write(["HTTP/1.1 101 Switching Protocols", "Upgrade: websocket", "Connection: Upgrade", `Sec-WebSocket-Accept: ${accept}`, "", ""].join("\r\n"));
}

function sendFrame(socket, text) {
  const body = Buffer.from(text);
  if (body.length < 126) {
    socket.write(Buffer.concat([Buffer.from([129, body.length]), body]));
    return;
  }
  if (body.length <= 0xffff) {
    socket.write(Buffer.concat([Buffer.from([129, 126, body.length >> 8, body.length & 255]), body]));
    return;
  }
  const head = Buffer.alloc(10);
  head[0] = 129;
  head[1] = 127;
  head.writeBigUInt64BE(BigInt(body.length), 2);
  socket.write(Buffer.concat([head, body]));
}

function readFrames(buffer, fragments = []) {
  const messages = [];
  let offset = 0;
  let nextFragments = fragments;
  while (offset + 2 <= buffer.length) {
    const first = buffer[offset];
    const second = buffer[offset + 1];
    const fin = Boolean(first & 0x80);
    const opcode = first & 0x0f;
    const masked = Boolean(second & 0x80);
    let length = second & 0x7f;
    let cursor = offset + 2;
    if (length === 126) {
      if (cursor + 2 > buffer.length) break;
      length = buffer.readUInt16BE(cursor);
      cursor += 2;
    } else if (length === 127) {
      if (cursor + 8 > buffer.length) break;
      const bigLength = buffer.readBigUInt64BE(cursor);
      if (bigLength > BigInt(Number.MAX_SAFE_INTEGER)) break;
      length = Number(bigLength);
      cursor += 8;
    }
    const maskOffset = cursor;
    if (masked) cursor += 4;
    if (cursor + length > buffer.length) break;
    const payload = Buffer.from(buffer.subarray(cursor, cursor + length));
    if (masked) {
      const mask = buffer.subarray(maskOffset, maskOffset + 4);
      for (let index = 0; index < payload.length; index += 1) payload[index] ^= mask[index % 4];
    }
    if (opcode === 8) return { messages, remaining: Buffer.alloc(0), fragments: [] };
    if (opcode === 1 || opcode === 2) {
      if (fin) messages.push(payload.toString("utf8"));
      else nextFragments = [payload];
    } else if (opcode === 0 && nextFragments.length) {
      nextFragments = [...nextFragments, payload];
      if (fin) {
        messages.push(Buffer.concat(nextFragments).toString("utf8"));
        nextFragments = [];
      }
    }
    offset = cursor + length;
  }
  return { messages, remaining: buffer.subarray(offset), fragments: nextFragments };
}

function isLoopback(req) {
  const address = req.socket?.remoteAddress || "";
  return address === "127.0.0.1" || address === "::1" || address === "::ffff:127.0.0.1";
}

function normalizeAgent(value, model = "") {
  const next = string(value).toLowerCase() || "vibyra";
  if (next === "official") return availableOfficialAgentForModel(model) || "vibyra";
  return agents.has(next) ? next : "vibyra";
}

function availableOfficialAgentForModel(model) {
  const agent = officialAgentForModel(model);
  return agent && aiTerminalAgentStatus(agent).available ? agent : "";
}

function officialAgentForModel(model) {
  const key = string(model).toLowerCase();
  const provider = key.includes("/") ? key.split("/")[0] : "";
  if (provider === "openai" || key.startsWith("gpt-") || key.includes("codex")) return "codex";
  if (provider === "anthropic" || provider === "claude" || key.startsWith("claude-")) return "claude";
  if (provider === "google" || provider === "gemini" || key.startsWith("gemini-")) return "gemini";
  return "";
}

function normalizeReasoningEffort(value) {
  const effort = string(value) || "medium";
  return ["low", "medium", "high", "xhigh", "none"].includes(effort) ? effort : "medium";
}

function normalizeTokenMode(value) {
  return string(value).toLowerCase() === "provider" ? "provider" : "vibyra";
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
