import { create } from "zustand";
import { confirmClose } from "../ipc/session";
import { saveSessionNow } from "../lib/sessionPersistence";
import { useTerminalStore } from "./terminalStore";

interface CloseGuardStore {
  prompting: string[];
  closing: boolean;
  error: string | null;
  request: () => Promise<void>;
  confirm: () => Promise<void>;
  forceClose: () => Promise<void>;
  cancel: () => void;
}

export const useCloseGuardStore = create<CloseGuardStore>((set, get) => ({
  prompting: [],
  closing: false,
  error: null,
  request: async () => {
    if (get().closing || get().prompting.length) return;
    const running = useTerminalStore.getState().panes.filter((p) => p.status === "running")
      .map((p) => p.customTitle || p.osc || p.title);
    if (!running.length) { await get().confirm(); return; }
    set({ prompting: running, error: null });
  },
  confirm: async () => {
    if (get().closing) return;
    set({ closing: true, error: null });
    try {
      await saveSessionNow(true);
      await confirmClose();
    } catch {
      set({ closing: false, error: "Your workspace could not be saved. Try again, or keep Vibyra open and check the available disk space." });
    }
  },
  forceClose: async () => {
    set({ closing: true });
    try { await confirmClose(); }
    catch { set({ closing: false, error: "Vibyra could not quit. Please try again." }); }
  },
  cancel: () => set({ prompting: [], error: null }),
}));
