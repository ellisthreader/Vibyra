import { create } from "zustand";

import { aiServiceStatus, clearOpenAiKey, setOpenAiKey } from "../ipc/ai";
import { spendNotification, spendTier, type SpendTier } from "../lib/aiSpendNotifications";
import { useNotificationStore } from "./notificationStore";
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

// Fires once per tier per period. `AiUsage` already carries the day and month
// keys, so they double as the reset signal — no timer, nothing persisted.
let lastTier: SpendTier = "none";
let lastPeriod = "";

function warnOnSpend(usage: AiServiceStatus["usage"], limits: AiServiceStatus["limits"]): void {
  const period = `${usage.day}/${usage.month}`;
  if (period !== lastPeriod) {
    lastPeriod = period;
    lastTier = "none";
  }
  const tier = spendTier(usage, limits);
  if (tier === lastTier || tier === "none") {
    lastTier = tier;
    return;
  }
  lastTier = tier;
  const notice = spendNotification(tier);
  if (notice) useNotificationStore.getState().push(notice);
}

export const useAiServiceStore = create<AiServiceStore>((set) => ({
  status: null,
  busy: false,
  error: null,
  saved: false,

  refresh: async () => {
    try {
      const status = await aiServiceStatus();
      set({ status });
      warnOnSpend(status.usage, status.limits);
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
