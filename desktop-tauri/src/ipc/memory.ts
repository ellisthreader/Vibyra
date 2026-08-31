import { invoke } from "@tauri-apps/api/core";

// The connected Obsidian vault. One for the whole app, connected from
// Settings → Integrations; read-only, searched locally, never uploaded.

export interface MemoryVaultSummary {
  id: string;
  name: string;
  location: string;
  noteCount: number;
  countLimited: boolean;
}

export interface MemorySourcesState {
  vault: MemoryVaultSummary | null;
  suggestions: MemoryVaultSummary[];
  warning: string | null;
}

export interface MemorySnippet {
  path: string;
  content: string;
}

export function loadMemorySources(): Promise<MemorySourcesState> {
  return invoke("memory_sources");
}

export function connectMemoryVault(
  candidateId: string | null = null,
): Promise<MemorySourcesState> {
  return invoke("connect_obsidian_vault", { candidateId });
}

export function disconnectMemoryVault(): Promise<MemorySourcesState> {
  return invoke("disconnect_obsidian_vault");
}

/** The notes worth lending for one question, ranked natively. */
export function searchMemorySources(query: string): Promise<MemorySnippet[]> {
  return invoke("search_memory_sources", { query });
}
