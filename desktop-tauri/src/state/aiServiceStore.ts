import { create } from "zustand";

import { aiServiceStatus, clearOpenAiKey, setOpenAiKey } from "../ipc/ai";
import type { AiServiceStatus } from "../types";
import { useSettingsStore } from "./settingsStore";

interface AiServiceStore {
  status: AiServiceStatus | null;
  busy: boolean;
  error: string | null;
  saved: boolean;
  refresh: () => Promise<void>;
  save: (key: string) => Promise<boolean>;
  remove: () => Promise<void>;
}

/** Mirrors `openaiKeyConfigured`, which gates chat and dictation elsewhere. */
async function syncSettings(): Promise<void> {
  await useSettingsStore.getState().load();
}

export const useAiServiceStore = create<AiServiceStore>((set) => ({
  status: null,
  busy: false,
  error: null,
  saved: false,

  refresh: async () => {
    try {
      set({ status: await aiServiceStatus() });
    } catch (error) {
      set({ error: String(error) });
    }
  },

  save: async (key) => {
    set({ busy: true, error: null, saved: false });
    try {
      const status = await setOpenAiKey(key);
      set({ status, busy: false, saved: true });
      await syncSettings();
      return true;
    } catch (error) {
      set({ busy: false, error: String(error) });
      return false;
    }
  },

  remove: async () => {
    set({ busy: true, error: null, saved: false });
    try {
      const status = await clearOpenAiKey();
      set({ status, busy: false });
      await syncSettings();
    } catch (error) {
      set({ busy: false, error: String(error) });
    }
  },
}));
