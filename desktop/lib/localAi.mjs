import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const OLLAMA_URL = String(process.env.VIBYRA_OLLAMA_URL || "http://127.0.0.1:11434").replace(/\/+$/, "");
const DEFAULT_MODEL = String(process.env.VIBYRA_LOCAL_MODEL || "qwen3:4b").trim() || "qwen3:4b";
const REQUEST_TIMEOUT_MS = 130000;
const MAX_CONTEXT_CHARS = 18000;
let ollamaStartPromise = null;

const VIBYRA_SYSTEM_PROMPT = [
  "You are Vibyra AI, the private local assistant inside Vibyra Desktop.",
  "Help with the active terminal, software projects, debugging, code, and concise technical questions.",
  "Vibyra Desktop can open and close its terminals and assign tasks to them through structured desktop actions handled before this model is called.",
  "Never claim that Vibyra cannot control terminals, cannot run terminal actions, or is not a terminal emulator.",
  "If a requested terminal action reaches you without an action result, say its wording was not safely recognized and that no action ran.",
  "Use the supplied Vibyra project context and memory when relevant.",
  "Never claim you ran a command, opened a file, or changed code unless the context explicitly confirms it.",
  "When an action is needed, state the exact command or next step and ask for approval where destructive or sensitive.",
  "Prefer direct, practical answers. Do not discuss image generation unless the user explicitly asks."
].join(" ");

export async function localAiStatus(fetchImpl = fetch) {
  try {
    let response;
    try {
      response = await request(fetchImpl, `${OLLAMA_URL}/api/tags`, { method: "GET" }, 3000);
    } catch (error) {
      if (fetchImpl !== fetch || !(await ensureOllamaRunning())) throw error;
      response = await request(fetchImpl, `${OLLAMA_URL}/api/tags`, { method: "GET" }, 5000);
    }
    const payload = await readJson(response);
    if (!response.ok) return unavailableStatus("Ollama did not return a healthy response.");
    const models = Array.isArray(payload.models)
      ? payload.models.map((item) => String(item?.name || item?.model || "").trim()).filter(Boolean)
      : [];
    return {
      available: true,
      model: DEFAULT_MODEL,
      modelInstalled: models.some((name) => modelMatches(name, DEFAULT_MODEL)),
      models
    };
  } catch {
    return unavailableStatus("Ollama is not running.");
  }
}

async function ensureOllamaRunning() {
  if (ollamaStartPromise) return ollamaStartPromise;
  ollamaStartPromise = startOllama();
  try {
    return await ollamaStartPromise;
  } finally {
    ollamaStartPromise = null;
  }
}

async function startOllama() {
  const binary = ollamaBinary();
  if (!binary) return false;
  const child = spawn(binary, ["serve"], { detached: true, stdio: "ignore" });
  child.on("error", () => {});
  child.unref();
  for (let attempt = 0; attempt < 10; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 350));
    try {
      const response = await request(fetch, `${OLLAMA_URL}/api/tags`, { method: "GET" }, 1000);
      if (response.ok) return true;
    } catch {
      // Ollama can take a few seconds to initialize CUDA on first launch.
    }
  }
  return false;
}

function ollamaBinary() {
  const configured = String(process.env.VIBYRA_OLLAMA_BIN || "").trim();
  const candidates = [
    configured,
    join(homedir(), ".local", "bin", "ollama"),
    join(homedir(), ".local", "opt", "ollama", "bin", "ollama"),
    "/usr/local/bin/ollama",
    "/usr/bin/ollama"
  ].filter(Boolean);
  return candidates.find((candidate) => existsSync(candidate)) || "";
}

export async function sendLocalVibyraChat(payload, fetchImpl = fetch) {
  const status = await localAiStatus(fetchImpl);
  if (!status.available) throw localAiError("Local Vibyra AI is offline. Install and start Ollama, then retry.", 503, "ollama_offline");
  if (!status.modelInstalled) {
    throw localAiError(`The local model is not installed. Run: ollama pull ${DEFAULT_MODEL}`, 503, "ollama_model_missing");
  }

  const messages = [
    { role: "system", content: VIBYRA_SYSTEM_PROMPT },
    ...normalizeHistory(payload?.history),
    { role: "user", content: localPrompt(payload) }
  ];
  const response = await request(fetchImpl, `${OLLAMA_URL}/api/chat`, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({
      model: DEFAULT_MODEL,
      messages,
      stream: false,
      keep_alive: "10m",
      options: { num_ctx: 8192, temperature: 0.2 }
    })
  });
  const result = await readJson(response);
  if (!response.ok) {
    const message = String(result?.error || "Local Vibyra AI could not complete this chat.");
    throw localAiError(message, response.status || 500, "ollama_error");
  }
  return {
    ok: true,
    reply: String(result?.message?.content || "").trim() || "The local model returned an empty response.",
    model: result?.model || DEFAULT_MODEL,
    modelKey: `local/${result?.model || DEFAULT_MODEL}`,
    provider: "local",
    local: true,
    creditCost: null,
    creditsBalance: null
  };
}

function localPrompt(payload) {
  const sections = [String(payload?.prompt || "").trim()];
  const project = String(payload?.project || "").trim();
  if (project) sections.push(`Active Vibyra project: ${project}`);
  const files = Array.isArray(payload?.projectFiles) ? payload.projectFiles : [];
  if (files.length) sections.push(`Relevant project context:\n${JSON.stringify(files).slice(0, MAX_CONTEXT_CHARS)}`);
  return sections.filter(Boolean).join("\n\n").slice(0, MAX_CONTEXT_CHARS);
}

function normalizeHistory(history) {
  if (!Array.isArray(history)) return [];
  return history.slice(-6).flatMap((item) => {
    const role = item?.role === "assistant" ? "assistant" : item?.role === "user" ? "user" : "";
    const content = String(item?.text || item?.content || "").trim().slice(0, 1600);
    return role && content ? [{ role, content }] : [];
  });
}

async function request(fetchImpl, url, options, timeoutMs = REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchImpl(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (error?.name === "AbortError") throw localAiError("Local Vibyra AI timed out.", 504, "ollama_timeout");
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function modelMatches(installed, configured) {
  const left = String(installed).toLowerCase();
  const right = String(configured).toLowerCase();
  return left === right || left === `${right}:latest` || `${left}:latest` === right;
}

function unavailableStatus(error) {
  return { available: false, model: DEFAULT_MODEL, modelInstalled: false, models: [], error };
}

function localAiError(message, status, code) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

async function readJson(response) {
  try {
    return await response.json();
  } catch {
    return {};
  }
}
