import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const START_MARKER = "<!-- VIBYRA_MEMORY_START -->";
const END_MARKER = "<!-- VIBYRA_MEMORY_END -->";

export function prepareAiTerminalMemoryFiles(sessionDir, memoryInstructions) {
  const memory = String(memoryInstructions || "").trim();
  if (!memory) return {};
  const contextDir = join(sessionDir, "memory-context");
  mkdirSync(contextDir, { recursive: true, mode: 0o700 });
  const geminiContextPath = join(contextDir, "GEMINI.md");
  const geminiSettingsPath = join(sessionDir, "gemini-settings.json");
  writePrivate(geminiContextPath, memory);
  writePrivate(geminiSettingsPath, JSON.stringify({
    context: {
      includeDirectories: [contextDir],
      loadMemoryFromIncludeDirectories: true
    }
  }, null, 2));
  return { geminiContextPath, geminiSettingsPath };
}

export function applyCodexTerminalMemory(codexHome, memoryInstructions) {
  const memory = String(memoryInstructions || "").trim();
  if (!codexHome || !memory) return "";
  const path = join(codexHome, "AGENTS.md");
  const existing = existsSync(path) ? readFileSync(path, "utf8") : "";
  const cleaned = removeMemoryBlock(existing).trimEnd();
  const block = `${START_MARKER}\n# Vibyra Project Memory\n\n${memory}\n${END_MARKER}`;
  writePrivate(path, cleaned ? `${cleaned}\n\n${block}\n` : `${block}\n`);
  return path;
}

function removeMemoryBlock(value) {
  const start = value.indexOf(START_MARKER);
  const end = value.indexOf(END_MARKER);
  if (start < 0 || end < start) return value;
  return `${value.slice(0, start)}${value.slice(end + END_MARKER.length)}`;
}

function writePrivate(path, content) {
  writeFileSync(path, content, { mode: 0o600 });
  try { chmodSync(path, 0o600); } catch {}
}
