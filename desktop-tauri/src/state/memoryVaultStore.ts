import { create } from "zustand";

import {
  loadMemoryNote,
  loadMemoryNoteIndex,
  type MemoryNoteIndex,
  type MemoryNoteView,
} from "../ipc/memory";

interface CachedIndex extends MemoryNoteIndex {
  vaultId: string;
}

interface MemoryVaultStore {
  indexes: Record<string, CachedIndex>;
  notes: Record<string, MemoryNoteView>;
  indexLoading: Record<string, boolean>;
  noteLoading: Record<string, boolean>;
  errors: Record<string, string | null>;
  loadIndex: (key: string, vaultId: string) => Promise<void>;
  loadNote: (key: string, vaultId: string, path: string) => Promise<void>;
  clear: (key: string) => void;
}

const indexTasks = new Map<string, Promise<void>>();
const noteTasks = new Map<string, Promise<void>>();

function cacheKey(key: string, vaultId: string, path = ""): string {
  return `${key}\u0000${vaultId}\u0000${path}`;
}

function message(error: unknown): string {
  return String(error).replace(/^Error:\s*/, "");
}

export const useMemoryVaultStore = create<MemoryVaultStore>((set, get) => ({
  indexes: {},
  notes: {},
  indexLoading: {},
  noteLoading: {},
  errors: {},

  loadIndex: async (key, vaultId) => {
    if (get().indexes[key]?.vaultId === vaultId) return;
    const taskKey = cacheKey(key, vaultId);
    const current = indexTasks.get(taskKey);
    if (current) return current;
    set((state) => ({
      indexLoading: { ...state.indexLoading, [key]: true },
      errors: { ...state.errors, [key]: null },
    }));
    const task = loadMemoryNoteIndex(key)
      .then((index) =>
        set((state) => ({ indexes: { ...state.indexes, [key]: { ...index, vaultId } } })),
      )
      .catch((error) =>
        set((state) => ({ errors: { ...state.errors, [key]: message(error) } })),
      )
      .finally(() => {
        indexTasks.delete(taskKey);
        set((state) => ({ indexLoading: { ...state.indexLoading, [key]: false } }));
      });
    indexTasks.set(taskKey, task);
    return task;
  },

  loadNote: async (key, vaultId, path) => {
    const id = cacheKey(key, vaultId, path);
    if (get().notes[id]) return;
    const current = noteTasks.get(id);
    if (current) return current;
    set((state) => ({
      noteLoading: { ...state.noteLoading, [id]: true },
      errors: { ...state.errors, [id]: null },
    }));
    const task = loadMemoryNote(key, path)
      .then((note) => set((state) => ({ notes: { ...state.notes, [id]: note } })))
      .catch((error) =>
        set((state) => ({ errors: { ...state.errors, [id]: message(error) } })),
      )
      .finally(() => {
        noteTasks.delete(id);
        set((state) => ({ noteLoading: { ...state.noteLoading, [id]: false } }));
      });
    noteTasks.set(id, task);
    return task;
  },

  clear: (key) =>
    set((state) => {
      const indexes = { ...state.indexes };
      delete indexes[key];
      return { indexes };
    }),
}));

export function memoryVaultNoteKey(key: string, vaultId: string, path: string): string {
  return cacheKey(key, vaultId, path);
}
