import { create } from "zustand";

import { confirmClose } from "../ipc/session";
import { saveSessionNow } from "../lib/sessionPersistence";
import { useTerminalStore } from "./terminalStore";

interface CloseGuardStore {
  /** Titles of the panes still running; empty while the prompt is closed. */
  prompting: string[];
  closing: boolean;
  /** Called when Rust vetoes a close and hands the decision to the UI. */
  request: () => Promise<void>;
  confirm: () => Promise<void>;
  cancel: () => void;
}

function runningTitles(): string[] {
  return useTerminalStore
    .getState()
    .panes.filter((pane) => pane.status === "running")
    .map((pane) => pane.customTitle || pane.osc || pane.title);
}

/** Saves the full session, then releases Rust's veto so the window can shut. */
async function saveAndClose(): Promise<void> {
  // Save failures are swallowed on purpose: losing the session is bad, but
  // trapping the user in a window they cannot close is worse.
  await saveSessionNow(true).catch(() => {});
  await confirmClose().catch(() => {});
}

export const useCloseGuardStore = create<CloseGuardStore>((set, get) => ({
  prompting: [],
  closing: false,

  request: async () => {
    if (get().closing) return;
    const running = runningTitles();
    if (running.length === 0) {
      set({ closing: true });
      await saveAndClose();
      return;
    }
    set({ prompting: running });
  },

  confirm: async () => {
    if (get().closing) return;
    set({ closing: true });
    await saveAndClose();
  },

  cancel: () => set({ prompting: [] }),
}));
