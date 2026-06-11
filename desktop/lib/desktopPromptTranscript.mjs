import { appendFile, chmod, mkdir, stat } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const moduleDir = dirname(fileURLToPath(import.meta.url));
export const defaultPromptTranscriptPath = join(
  moduleDir,
  "..",
  "..",
  "Vibyra",
  "Prompt Transcripts.md"
);
const DOCUMENT_HEADER = [
  "# Vibyra Prompt Transcripts",
  "",
  "Local append-only record of prompt, response, action, and outcome events. Raw audio is not stored.",
  ""
].join("\n");
let appendQueue = Promise.resolve();

export function appendDesktopPromptTranscript(entry = {}, options = {}) {
  const event = entry.event === "outcome" ? "outcome" : "prompt";
  const prompt = String(entry.prompt ?? entry.transcript ?? "");
  const response = String(entry.response ?? "");
  const result = String(entry.result ?? "");
  const error = String(entry.error ?? "");
  if (event === "prompt" && !prompt.trim()) return Promise.resolve({ ok: false, skipped: true });
  if (event === "outcome" && !response.trim() && !result.trim() && !error.trim() && !entry.actions) {
    return Promise.resolve({ ok: false, skipped: true });
  }
  const filePath = options.filePath || defaultPromptTranscriptPath;
  const now = options.now instanceof Date ? options.now : new Date();
  const normalized = normalizeEntry(entry, event, now);
  const operation = appendQueue.then(() => appendEvent(filePath, normalized, prompt, now));
  appendQueue = operation.catch(() => {});
  return operation;
}

async function appendEvent(filePath, entry, prompt, now) {
  await mkdir(dirname(filePath), { recursive: true });
  await ensureDocument(filePath);
  await chmod(filePath, 0o600);
  await appendFile(filePath, formatEntry(entry, prompt, now), {
    encoding: "utf8",
    mode: 0o600
  });
  return {
    event: entry.event,
    ok: true,
    path: filePath,
    sessionId: entry.sessionId,
    startedAt: entry.startedAt,
    turnId: entry.turnId
  };
}

async function ensureDocument(filePath) {
  try {
    const details = await stat(filePath);
    if (details.size > 0) return;
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  await appendFile(filePath, DOCUMENT_HEADER, { encoding: "utf8", mode: 0o600 });
}

function formatEntry(entry, prompt, now) {
  if (entry.event === "outcome") return formatOutcome(entry, now);
  const surface = surfaceLabel(entry.source);
  const terminal = metadata(entry.terminalName, entry.terminalId || "setup");
  const project = metadata(entry.projectName, entry.projectId || "No project");
  return [
    "",
    `## Turn ${entry.turnId}`,
    "",
    "- Event: Prompt",
    `- Timestamp: ${now.toISOString()}`,
    `- Session: ${entry.sessionId}`,
    `- Surface: ${surface}`,
    `- Terminal: ${terminal}`,
    `- Project: ${project}`,
    `- Model: ${metadata(entry.model, "Unknown")}`,
    "",
    "Prompt (verbatim):",
    "",
    verbatim(prompt),
    ""
  ].join("\n");
}

function formatOutcome(entry, now) {
  const sections = [
    "",
    `## Outcome ${entry.turnId}`,
    "",
    "- Event: Outcome",
    `- Timestamp: ${now.toISOString()}`,
    `- Session: ${entry.sessionId}`,
    `- Surface: ${surfaceLabel(entry.source)}`,
    `- Status: ${metadata(entry.status, "completed")}`,
    `- Duration: ${duration(entry.durationMs)}`,
    `- Model: ${metadata(entry.model, "Unknown")}`
  ];
  appendTextSection(sections, "Assistant response (verbatim):", entry.response);
  appendTextSection(sections, "Final result (verbatim):", entry.result);
  appendTextSection(sections, "Error (verbatim):", entry.error);
  if (entry.actions !== undefined && entry.actions !== null) {
    sections.push("", "Actions (JSON):", "", verbatim(json(entry.actions)));
  }
  sections.push("");
  return sections.join("\n");
}

function normalizeEntry(entry, event, now) {
  const turnId = identifier(entry.turnId, `turn-${randomUUID()}`);
  return {
    ...entry,
    event,
    sessionId: identifier(entry.sessionId, `session-${metadata(entry.terminalId, "desktop")}`),
    startedAt: event === "prompt"
      ? String(entry.startedAt || now.toISOString())
      : String(entry.startedAt || ""),
    turnId
  };
}

function appendTextSection(sections, label, value) {
  const text = String(value || "");
  if (!text.trim()) return;
  sections.push("", label, "", verbatim(text));
}

function verbatim(value) {
  return String(value).split("\n").map((line) => `    ${line}`).join("\n");
}

function json(value) {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return JSON.stringify({ error: "Actions could not be serialized." });
  }
}

function identifier(value, fallback) {
  return String(value || fallback)
    .replace(/[^a-zA-Z0-9._:-]+/g, "-")
    .slice(0, 240);
}

function duration(value) {
  const milliseconds = Math.max(0, Math.min(Number(value) || 0, 86_400_000));
  return `${Math.round(milliseconds)} ms`;
}

function surfaceLabel(source) {
  return {
    "ai-talk": "AI Talk",
    "desktop-chat": "Desktop Chat",
    "terminal-ai-chat": "Terminal AI Chat",
    "terminal-chat": "Terminal Chat",
    "terminal-dictation": "Terminal Dictation",
    "terminal-pty": "Native Terminal"
  }[source] || "Unknown";
}

function metadata(value, fallback) {
  return String(value || fallback)
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim()
    .slice(0, 240);
}
