import { create } from "zustand";

import {
  connectMemoryVault,
  disconnectMemoryVault,
  loadMemorySources,
  type MemorySourcesState,
} from "../ipc/memory";

// The connected Obsidian vault, app-wide.
//
// It used to be keyed by project, alongside a per-project MEMORY.md the dock
// let you edit. Both are gone: a person has one set of notes, and the panel
// that displayed them lost to Obsidian itself sitting one window away. What
// survives is the part that earns its place — the vault an agent can be lent
// notes from. See `commands/memory.rs`.

interface VaultStore {
  sources: MemorySourcesState | null;
  loaded: boolean;
  busy: boolean;
  error: string | null;
  load: () => Promise<void>;
  connect: (candidateId?: string) => Promise<void>;
  disconnect: () => Promise<void>;
}

function errorMessage(error: unknown): string {
  return String(error).replace(/^Error:\s*/, "");
}

/** In flight, so overlapping callers share one lookup rather than racing. */
let loading: Promise<void> | null = null;

export const useVaultStore = create<VaultStore>((set) => ({
  sources: null,
  loaded: false,
  busy: false,
  error: null,

  // Always re-reads rather than caching on `loaded`: the vault is a folder on
  // disk that can be moved or deleted between two openings of this pane, and a
  // card still reading "Connected" for a vault that is gone is worse than a
  // moment of "Checking". `loaded` only distinguishes first paint.
  load: async () => {
    loading ??= loadMemorySources()
      .then((sources) => set({ sources, loaded: true }))
      .catch((error) => set({ error: errorMessage(error), loaded: true }))
      .finally(() => {
        loading = null;
      });
    await loading;
  },

  connect: async (candidateId) => {
    set({ busy: true, error: null });
    try {
      const sources = await connectMemoryVault(candidateId ?? null);
      set({ sources, loaded: true });
    } catch (error) {
      set({ error: errorMessage(error) });
    } finally {
      set({ busy: false });
    }
  },

  disconnect: async () => {
    set({ busy: true, error: null });
    try {
      const sources = await disconnectMemoryVault();
      set({ sources, loaded: true });
    } catch (error) {
      set({ error: errorMessage(error) });
    } finally {
      set({ busy: false });
    }
  },
}));
