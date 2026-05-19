import type { ProjectMemory, ProjectMemoryEntry } from "../types/domain";

export function normalizeProjectMemories(value: unknown): Record<string, ProjectMemory> {
  if (!value || typeof value !== "object") return {};
  const entries = Object.entries(value as Record<string, unknown>)
    .map(([projectId, memory]) => [projectId, normalizeProjectMemory(memory)] as const)
    .filter(([, memory]) => memory.entries.length > 0);
  return Object.fromEntries(entries);
}

export function withProjectMemoryPrompt(memory: ProjectMemory | undefined, prompt: string) {
  const entries = memoryEntriesForPrompt(memory);
  if (entries.length === 0) return prompt;
  return [
    "Saved context memory:",
    ...entries.map((entry) => `- ${entry.text}`),
    "",
    prompt
  ].join("\n");
}

export function makeBriefMemoryText(kindLabel: string, frameworkLabel: string, frameworkDescription: string) {
  return `Project direction: ${kindLabel} using ${frameworkLabel}. ${frameworkDescription}`.trim();
}

export function memoryEntriesForPrompt(memory: ProjectMemory | undefined) {
  return (memory?.entries ?? [])
    .filter((entry) => entry.source !== "brief" && entry.text.trim())
    .slice(-6);
}

export function normalizeProjectMemory(value: unknown): ProjectMemory {
  if (!value || typeof value !== "object") return { entries: [], updatedAt: "" };
  const memory = value as Partial<ProjectMemory>;
  const entries = Array.isArray(memory.entries)
    ? memory.entries.map(normalizeEntry).filter((entry): entry is ProjectMemoryEntry => Boolean(entry)).slice(-8)
    : [];
  return {
    entries,
    updatedAt: typeof memory.updatedAt === "string" ? memory.updatedAt : (entries.length > 0 ? entries[entries.length - 1].createdAt : "")
  };
}

function normalizeEntry(value: unknown): ProjectMemoryEntry | null {
  if (!value || typeof value !== "object") return null;
  const entry = value as Partial<ProjectMemoryEntry>;
  const id = String(entry.id ?? "").trim();
  const text = String(entry.text ?? "").trim();
  if (!id || !text) return null;
  return {
    id,
    text: text.slice(0, 220),
    source: entry.source === "brief" ? "brief" : "user",
    createdAt: typeof entry.createdAt === "string" ? entry.createdAt : new Date().toISOString()
  };
}
