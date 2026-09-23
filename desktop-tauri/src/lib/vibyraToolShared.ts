import { useProjectStore } from "../state/projectStore";
import { useSettingsStore } from "../state/settingsStore";

// The pieces every Vibyra tool needs: what a result looks like, and how a name
// a person said becomes something the app can act on.

export interface ToolResult {
  /** One line for the thread: what happened, in the past tense. */
  summary: string;
  /** What the model gets back. Plain text, because it is about to be read out
   * or written into a sentence, not parsed. */
  detail: string;
  failed?: boolean;
}

export const fail = (summary: string): ToolResult => ({ summary, detail: summary, failed: true });
export const text = (value: unknown): string => (typeof value === "string" ? value.trim() : "");
export const count = (value: unknown, fallback: number): number =>
  Number.isFinite(value) ? Math.max(1, Math.min(8, Math.trunc(value as number))) : fallback;

export function projects() {
  return useSettingsStore.getState().settings?.projects ?? [];
}

/** By name, loosely: the model is repeating what the person typed, and "HKE"
 * should find "HKE" however it was capitalised. */
export function resolveProject(name: string) {
  const all = projects();
  if (!name) {
    const active = useProjectStore.getState().activeId;
    return all.find((project) => project.id === active) ?? null;
  }
  const wanted = name.toLowerCase();
  return (
    all.find((project) => project.name.toLowerCase() === wanted) ??
    all.find((project) => project.name.toLowerCase().includes(wanted)) ??
    null
  );
}
