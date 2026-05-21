import { randomUUID, createHash } from "node:crypto";
import { projectById } from "./projects.mjs";
import { readBody, send } from "./http.mjs";
import { aiTerminalAgentStatus, listAiTerminalAgentStatuses, spawnAiTerminalProcess } from "./aiTerminalProcess.mjs";

export const MAX_PTY_TERMINAL_SESSIONS = 12;

const MAX_OUTPUT_BUFFER = 50_000;
const agents = new Set(["shell", "codex", "claude", "gemini"]);
const sessions = new Map();
const subscribers = new Map();

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
  socket.on("data", (chunk) => {
    for (const message of readFrames(chunk)) handleSocketMessage(session.id, message);
  });
  socket.on("close", unsubscribe);
  socket.on("error", unsubscribe);
}

export function createPtyTerminal(body = {}) {
  if (sessions.size >= MAX_PTY_TERMINAL_SESSIONS) throw httpError(429, `Vibyra Desktop supports up to ${MAX_PTY_TERMINAL_SESSIONS} terminals at once.`);
  const projectId = string(body.projectId);
  const project = projectById(projectId);
  const agent = normalizeAgent(body.agent);
  const agentStatus = aiTerminalAgentStatus(agent);
  const session = {
    id: string(body.id) || `pty-${Date.now()}-${randomUUID().slice(0, 8)}`,
    title: string(body.title).slice(0, 72) || "Terminal",
    agent,
    agentStatus,
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
  session.process = spawnAiTerminalProcess({
    agent: session.agent,
    cwd: session.cwd,
    cols: session.cols,
    rows: session.rows,
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
  });
  return publicSession(session);
}

export function closePtyTerminal(id) {
  const session = sessions.get(string(id));
  if (!session) return;
  if (session.process) session.process.kill("SIGTERM");
  sessions.delete(session.id);
  subscribers.delete(session.id);
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

function handleSocketMessage(id, message) {
  let payload = null;
  try { payload = JSON.parse(message); } catch { return; }
  if (payload?.type === "input") writePtyInput(id, String(payload.data ?? ""));
  if (payload?.type === "resize") resizePtyTerminal(id, payload);
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
  const head = body.length < 126 ? Buffer.from([129, body.length]) : Buffer.from([129, 126, body.length >> 8, body.length & 255]);
  socket.write(Buffer.concat([head, body]));
}

function readFrames(buffer) {
  const messages = [];
  let offset = 0;
  while (offset + 6 <= buffer.length) {
    const length = buffer[offset + 1] & 127;
    const maskOffset = offset + 2 + (length === 126 ? 2 : 0);
    const size = length === 126 ? buffer.readUInt16BE(offset + 2) : length;
    const dataOffset = maskOffset + 4;
    if (dataOffset + size > buffer.length) break;
    const mask = buffer.subarray(maskOffset, dataOffset);
    const data = buffer.subarray(dataOffset, dataOffset + size).map((byte, index) => byte ^ mask[index % 4]);
    messages.push(data.toString("utf8"));
    offset = dataOffset + size;
  }
  return messages;
}

function isLoopback(req) {
  const address = req.socket?.remoteAddress || "";
  return address === "127.0.0.1" || address === "::1" || address === "::ffff:127.0.0.1";
}

function normalizeAgent(value) {
  const next = string(value).toLowerCase() || "codex";
  return agents.has(next) ? next : "codex";
}

function clamp(value, fallback) {
  const numeric = Number.parseInt(String(value || ""), 10);
  return Math.min(240, Math.max(10, Number.isFinite(numeric) ? numeric : fallback));
}

function label(agent) {
  return agent === "claude" ? "Claude" : agent === "gemini" ? "Gemini" : agent === "shell" ? "Shell" : "Codex";
}

function string(value) {
  return String(value ?? "").trim();
}

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  throw error;
}
