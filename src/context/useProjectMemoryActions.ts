import { makeBriefMemoryText } from "../utils/projectMemory";
import { useAppState } from "./useAppState";

export function useProjectMemoryActions(store: ReturnType<typeof useAppState>) {
  const { setters } = store;

  function rememberProjectMemory(projectId: string, text: string) {
    const clean = normalizeMemoryText(text);
    if (!projectId || !clean) return;
    const now = new Date().toISOString();
    setters.setProjectMemories((current) => {
      const existing = current[projectId]?.entries ?? [];
      const duplicate = existing.some((entry) => entry.text.toLowerCase() === clean.toLowerCase());
      if (duplicate) return current;
      const entries = [
        ...existing,
        { id: makeMemoryId("user"), text: clean, source: "user" as const, createdAt: now }
      ].slice(-8);
      return { ...current, [projectId]: { entries, updatedAt: now } };
    });
  }

  function rememberProjectBrief(projectId: string, kindLabel: string, frameworkLabel: string, frameworkDescription: string) {
    if (!projectId) return;
    const now = new Date().toISOString();
    const text = makeBriefMemoryText(kindLabel, frameworkLabel, frameworkDescription);
    setters.setProjectMemories((current) => {
      const existing = current[projectId]?.entries ?? [];
      const entries = [
        { id: `brief-${projectId}`, text, source: "brief" as const, createdAt: now },
        ...existing.filter((entry) => entry.source !== "brief")
      ].slice(0, 8);
      return { ...current, [projectId]: { entries, updatedAt: now } };
    });
  }

  function forgetProjectMemory(projectId: string, entryId: string) {
    if (!projectId || !entryId) return;
    setters.setProjectMemories((current) => {
      const memory = current[projectId];
      if (!memory) return current;
      const entries = memory.entries.filter((entry) => entry.id !== entryId || entry.source === "brief");
      return { ...current, [projectId]: { entries, updatedAt: new Date().toISOString() } };
    });
  }

  return { forgetProjectMemory, rememberProjectBrief, rememberProjectMemory };
}

function normalizeMemoryText(text: string) {
  return text.replace(/\s+/g, " ").trim().slice(0, 220);
}

function makeMemoryId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
