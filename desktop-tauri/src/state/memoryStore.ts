import { create } from "zustand";

import {
  connectMemoryVault,
  disconnectMemoryVault,
  loadMemoryFile,
  loadMemorySources,
  pickMemoryFiles,
  saveMemoryFile,
  type MemorySourcesState,
} from "../ipc/memory";
import { mergeImportedMemory } from "../lib/memoryImport";

interface MemoryStore {
  contents: Record<string, string>;
  loaded: Record<string, boolean>;
  sources: Record<string, MemorySourcesState>;
  sourcesLoaded: Record<string, boolean>;
  saving: boolean;
  sourceBusy: boolean;
  sourceError: string | null;
  notice: string | null;
  load: (key: string) => Promise<void>;
  setContent: (key: string, content: string) => void;
  connectVault: (key: string, candidateId?: string) => Promise<void>;
  disconnectVault: (key: string) => Promise<void>;
  importFiles: (key: string) => Promise<void>;
}

const saveTimers = new Map<string, ReturnType<typeof setTimeout>>();
const loadTasks = new Map<string, Promise<void>>();
let noticeTimer: ReturnType<typeof setTimeout> | null = null;

function errorMessage(error: unknown): string {
  return String(error).replace(/^Error:\s*/, "");
}

function showNotice(message: string): void {
  if (noticeTimer) clearTimeout(noticeTimer);
  useMemoryStore.setState({ notice: message });
  noticeTimer = setTimeout(() => useMemoryStore.setState({ notice: null }), 3_200);
}

async function persistNow(key: string, content: string): Promise<void> {
  const timer = saveTimers.get(key);
  if (timer) clearTimeout(timer);
  saveTimers.delete(key);
  useMemoryStore.setState({ saving: true });
  try {
    await saveMemoryFile(key, content);
  } finally {
    useMemoryStore.setState({ saving: false });
  }
}

export const useMemoryStore = create<MemoryStore>((set, get) => ({
  contents: {},
  loaded: {},
  sources: {},
  sourcesLoaded: {},
  saving: false,
  sourceBusy: false,
  sourceError: null,
  notice: null,

  load: async (key) => {
    const existing = loadTasks.get(key);
    if (existing) return existing;
    const task = (async () => {
      const state = get();
      const work: Promise<void>[] = [];
      if (!state.loaded[key]) {
        work.push(
          loadMemoryFile(key)
            .then((content) =>
              set((current) => ({
                contents: { ...current.contents, [key]: content },
                loaded: { ...current.loaded, [key]: true },
              })),
            )
            .catch(() => set((current) => ({ loaded: { ...current.loaded, [key]: true } }))),
        );
      }
      if (!state.sourcesLoaded[key]) {
        work.push(
          loadMemorySources(key)
            .then((sources) =>
              set((current) => ({
                sources: { ...current.sources, [key]: sources },
                sourcesLoaded: { ...current.sourcesLoaded, [key]: true },
                sourceError: null,
              })),
            )
            .catch((error) =>
              set((current) => ({
                sourceError: errorMessage(error),
                sourcesLoaded: { ...current.sourcesLoaded, [key]: true },
              })),
            ),
        );
      }
      await Promise.all(work);
    })().finally(() => loadTasks.delete(key));
    loadTasks.set(key, task);
    return task;
  },

  setContent: (key, content) => {
    set((state) => ({ contents: { ...state.contents, [key]: content } }));
    const existing = saveTimers.get(key);
    if (existing) clearTimeout(existing);
    saveTimers.set(
      key,
      setTimeout(() => {
        void persistNow(key, useMemoryStore.getState().contents[key] ?? "").catch(() => {});
      }, 700),
    );
  },

  connectVault: async (key, candidateId) => {
    set({ sourceBusy: true, sourceError: null });
    try {
      const sources = await connectMemoryVault(key, candidateId ?? null);
      set((state) => ({
        sources: { ...state.sources, [key]: sources },
        sourcesLoaded: { ...state.sourcesLoaded, [key]: true },
      }));
      if (sources.vault) showNotice(`Connected ${sources.vault.name}`);
    } catch (error) {
      set({ sourceError: errorMessage(error) });
    } finally {
      set({ sourceBusy: false });
    }
  },

  disconnectVault: async (key) => {
    set({ sourceBusy: true, sourceError: null });
    try {
      const sources = await disconnectMemoryVault(key);
      set((state) => ({ sources: { ...state.sources, [key]: sources } }));
      showNotice("Obsidian vault disconnected");
    } catch (error) {
      set({ sourceError: errorMessage(error) });
    } finally {
      set({ sourceBusy: false });
    }
  },

  importFiles: async (key) => {
    set({ sourceBusy: true, sourceError: null });
    try {
      await get().load(key);
      const batch = await pickMemoryFiles();
      if (batch.notes.length === 0) return;
      const content = mergeImportedMemory(get().contents[key] ?? "", batch.notes);
      set((state) => ({ contents: { ...state.contents, [key]: content } }));
      await persistNow(key, content);
      const skipped = batch.skipped ? ` · ${batch.skipped} skipped` : "";
      showNotice(`Imported ${batch.notes.length} note${batch.notes.length === 1 ? "" : "s"}${skipped}`);
    } catch (error) {
      set({ sourceError: errorMessage(error) });
    } finally {
      set({ sourceBusy: false });
    }
  },
}));
