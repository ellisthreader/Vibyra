import { create } from "zustand";

import type { PlanLimitNotice } from "../lib/planLimits";

interface PlanPromptStore {
  notice: PlanLimitNotice | null;
  /** The last limit reached and a count of them, so a phone that asked for the
   * launch can be told the same reason the Mac shows. */
  last: PlanLimitNotice | null;
  seq: number;
  show: (notice: PlanLimitNotice) => void;
  close: () => void;
}

/** One upgrade prompt at a time; a second limit replaces the first. */
export const usePlanPromptStore = create<PlanPromptStore>((set) => ({
  notice: null,
  last: null,
  seq: 0,
  show: (notice) => set((state) => ({ notice, last: notice, seq: state.seq + 1 })),
  close: () => set({ notice: null }),
}));
