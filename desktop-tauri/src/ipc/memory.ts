import { invoke } from "@tauri-apps/api/core";

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

export interface ImportedMemoryNote {
  name: string;
  content: string;
}

export interface MemoryImportBatch {
  notes: ImportedMemoryNote[];
  skipped: number;
}

export interface MemorySnippet {
  path: string;
  content: string;
}

export interface MemoryNoteIndex {
  paths: string[];
  limited: boolean;
}

export interface MemoryNoteView {
  path: string;
  content: string;
}

function projectArg(key: string): string | null {
  return key === "global" ? null : key;
}

export function loadMemoryFile(key: string): Promise<string> {
  return invoke("load_memory", { project: projectArg(key) });
}

export function saveMemoryFile(key: string, content: string): Promise<void> {
  return invoke("save_memory", { project: projectArg(key), content });
}

export function loadMemorySources(key: string): Promise<MemorySourcesState> {
  return invoke("memory_sources", { project: projectArg(key) });
}

export function connectMemoryVault(
  key: string,
  candidateId: string | null = null,
): Promise<MemorySourcesState> {
  return invoke("connect_obsidian_vault", { project: projectArg(key), candidateId });
}

export function disconnectMemoryVault(key: string): Promise<MemorySourcesState> {
  return invoke("disconnect_obsidian_vault", { project: projectArg(key) });
}

export function pickMemoryFiles(): Promise<MemoryImportBatch> {
  return invoke("pick_memory_files");
}

export function searchMemorySources(key: string, query: string): Promise<MemorySnippet[]> {
  return invoke("search_memory_sources", { project: projectArg(key), query });
}

export function loadMemoryNoteIndex(key: string): Promise<MemoryNoteIndex> {
  return invoke("memory_note_index", { project: projectArg(key) });
}

export function loadMemoryNote(key: string, path: string): Promise<MemoryNoteView> {
  return invoke("read_memory_note", { project: projectArg(key), path });
}
