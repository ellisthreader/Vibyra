import { create } from "zustand";

import { captureScreen, copySavedScreenshot, finishScreenshotEdit } from "../ipc/tools";
import type { CapturedScreenshot, Screenshot } from "../types";
import { useWorkspaceStore } from "./workspaceStore";

interface ScreenshotStore {
  shots: Screenshot[];
  draft: CapturedScreenshot | null;
  copiedPath: string | null;
  capture: () => Promise<void>;
  closeEditor: () => void;
  addShot: (shot: Screenshot) => void;
  copySaved: (shot: Screenshot) => Promise<void>;
  dismiss: (path: string) => void;
}

const MAX_SHOTS = 4;
let captureGeneration = 0;
// Re-entrancy guard only. It never reaches the UI, so keeping it out of the
// store spares every subscriber a notification per capture.
let capturing = false;
let copiedTimer: ReturnType<typeof setTimeout> | null = null;

export const useScreenshotStore = create<ScreenshotStore>((set, get) => ({
  shots: [],
  draft: null,
  copiedPath: null,

  // Nothing is drawn on screen between the shortcut and the grab: the capture
  // now includes Vibyra's own window, so any editor chrome painted first would
  // end up inside the screenshot.
  capture: async () => {
    if (capturing || get().draft) return;
    const generation = ++captureGeneration;
    capturing = true;
    try {
      const draft = await captureScreen();
      if (generation === captureGeneration) set({ draft });
      else void finishScreenshotEdit();
    } catch (error) {
      void finishScreenshotEdit();
      useWorkspaceStore.getState().setError(`Screenshot failed: ${String(error)}`);
    } finally {
      if (generation === captureGeneration) capturing = false;
    }
  },

  closeEditor: () => {
    captureGeneration += 1;
    capturing = false;
    void finishScreenshotEdit();
    set({ draft: null });
  },

  addShot: (shot) => {
    set((state) => ({ shots: [...state.shots, shot].slice(-MAX_SHOTS) }));
  },

  copySaved: async (shot) => {
    try {
      await copySavedScreenshot(shot.path);
      if (copiedTimer) clearTimeout(copiedTimer);
      set({ copiedPath: shot.path });
      copiedTimer = setTimeout(() => set({ copiedPath: null }), 1800);
    } catch (error) {
      useWorkspaceStore.getState().setError(`Copy failed: ${String(error)}`);
    }
  },

  dismiss: (path) => {
    set((state) => ({ shots: state.shots.filter((shot) => shot.path !== path) }));
  },
}));
