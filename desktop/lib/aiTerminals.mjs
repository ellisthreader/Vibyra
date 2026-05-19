import { sendDesktopChat } from "./desktopChat.mjs";
import { readBody, send } from "./http.mjs";

export const MAX_AI_TERMINAL_SESSIONS = 12;

const MAX_SESSION_MESSAGES = 40;
const REASONING_EFFORTS = new Set(["low", "medium", "high", "xhigh", "none"]);
const sessions = new Map();

export async function handleAiTerminalRoutes(req, res, url) {
  const route = terminalRoute(url.pathname);
  if (!route) return false;

  if (req.method === "GET" && route.action === "collection") {
    send(res, 200, { sessions: listAiTerminalSessions() });
    return true;
  }

  if (req.method === "POST" && route.action === "collection") {
    send(res, 200, { session: createAiTerminalSession(await readBody(req)) });
    return true;
  }

  if (req.method === "GET" && route.action === "get") {
    send(res, 200, { session: getAiTerminalSession(route.sessionId) });
    return true;
  }

  if (req.method === "POST" && route.action === "send") {
    send(res, 200, await sendAiTerminalPrompt(route.sessionId, await readBody(req)));
    return true;
  }

  if (req.method === "POST" && route.action === "close") {
    closeAiTerminalSession(route.sessionId);
    send(res, 200, { ok: true, sessions: listAiTerminalSessions() });
    return true;
  }

  throwHttpError(404, "Unknown AI terminal route.", { code: "AI_TERMINAL_ROUTE_NOT_FOUND" });
}

export function listAiTerminalSessions() {
  return Array.from(sessions.values())
    .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt))
    .map(publicSession);
}

export function createAiTerminalSession(body = {}) {
  if (sessions.size >= MAX_AI_TERMINAL_SESSIONS) {
    throwHttpError(429, `Vibyra Desktop supports up to ${MAX_AI_TERMINAL_SESSIONS} AI terminals at once.`, { code: "AI_TERMINAL_SESSION_LIMIT" });
  }

  const now = new Date().toISOString();
  const session = {
    id: makeTerminalId(),
    title: textSlice(body?.title, 80),
    projectId: normalizeString(body?.projectId),
    model: normalizeModel(body?.model),
    reasoningEffort: normalizeReasoningEffort(body?.reasoningEffort),
    messages: [],
    createdAt: now,
    updatedAt: now
  };
  sessions.set(session.id, session);
  return publicSession(session);
}

export function getAiTerminalSession(sessionId) {
  return publicSession(requireSession(sessionId));
}

export function closeAiTerminalSession(sessionId) {
  requireSession(sessionId);
  sessions.delete(sessionId);
}

export async function sendAiTerminalPrompt(sessionId, body = {}, chatSender = sendDesktopChat) {
  const session = requireSession(sessionId);
  const prompt = normalizePrompt(body?.prompt);
  const model = normalizeModel(body?.model ?? session.model);
  const reasoningEffort = normalizeReasoningEffort(body?.reasoningEffort ?? session.reasoningEffort);
  const projectId = normalizeString(body?.projectId ?? session.projectId);
  const history = normalizeHistory(Array.isArray(body?.history) ? body.history : session.messages);
  const userMessage = makeMessage("user", prompt);

  session.model = model;
  session.reasoningEffort = reasoningEffort;
  session.projectId = projectId;
  session.messages = [...session.messages, userMessage].slice(-MAX_SESSION_MESSAGES);
  session.title = session.title || textSlice(prompt.replace(/\s+/g, " "), 64);
  session.updatedAt = new Date().toISOString();

  const result = await chatSender({ history, model, projectId, prompt, reasoningEffort });

  const assistantMessage = makeMessage("assistant", String(result?.reply || ""));
  session.messages = [...session.messages, assistantMessage].slice(-MAX_SESSION_MESSAGES);
  session.updatedAt = new Date().toISOString();

  return {
    ok: true,
    session: publicSession(session),
    message: assistantMessage,
    reply: assistantMessage.content,
    title: result?.title || "",
    model: result?.model || "",
    modelKey: result?.modelKey || model,
    creditCost: result?.creditCost ?? null,
    creditsBalance: result?.creditsBalance ?? null,
    app: result?.app || null,
    user: result?.user || null
  };
}

export function resetAiTerminalSessionsForTests() { sessions.clear(); }

function terminalRoute(pathname) {
  if (pathname === "/desktop/terminals") return { action: "collection" };
  if (pathname === "/desktop/terminals/") return { action: "collection" };
  const parts = pathname.split("/").filter(Boolean);
  if (parts[0] !== "desktop" || parts[1] !== "terminals") return null;
  if (parts.length === 2) return { action: "collection" };
  if (parts.length === 3) return { action: "get", sessionId: decodeURIComponent(parts[2]) };
  if (parts.length === 4) return { action: parts[3], sessionId: decodeURIComponent(parts[2]) };
  return { action: "unknown" };
}

function publicSession(session) {
  return {
    id: session.id,
    title: session.title,
    projectId: session.projectId,
    model: session.model,
    reasoningEffort: session.reasoningEffort,
    messages: session.messages,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt
  };
}

function requireSession(sessionId) {
  const session = sessions.get(normalizeString(sessionId));
  if (!session) throwHttpError(404, "AI terminal session not found.", { code: "AI_TERMINAL_NOT_FOUND" });
  return session;
}

function makeMessage(role, content) {
  return { id: `msg-${Date.now()}-${Math.round(Math.random() * 100000)}`, role, content, createdAt: new Date().toISOString() };
}

function normalizeHistory(history) {
  if (!Array.isArray(history)) return [];
  return history
    .filter((item) => item && ["assistant", "user"].includes(item.role) && normalizeString(item.content ?? item.text))
    .slice(-8)
    .map((item) => ({ role: item.role, text: textSlice(item.content ?? item.text, 2000) }));
}

function normalizePrompt(prompt) {
  const value = normalizeString(prompt);
  if (!value) throwHttpError(422, "Enter a prompt before sending to this AI terminal.");
  return value;
}

function normalizeModel(model) {
  return normalizeString(model) || "auto";
}

function normalizeReasoningEffort(value) {
  const effort = normalizeString(value) || "medium";
  return REASONING_EFFORTS.has(effort) ? effort : "medium";
}

function normalizeString(value) {
  return String(value ?? "").trim();
}

function textSlice(value, max) {
  return normalizeString(value).slice(0, max);
}

function makeTerminalId() {
  let id = `term-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  while (sessions.has(id)) id = `term-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return id;
}

function throwHttpError(status, message, extra = {}) {
  const error = new Error(message);
  error.status = status;
  Object.assign(error, extra);
  throw error;
}
