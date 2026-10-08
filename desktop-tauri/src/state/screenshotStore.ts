import { create } from "zustand";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";

import { isMac } from "../lib/platform";
import {
  captureScreenForEditor,
  captureScreenshotQuick,
  copySavedScreenshot,
  finishScreenshotEdit,
  revealScreenshot,
} from "../ipc/tools";
import type { CapturedScreenshot, Screenshot } from "../types";
import { useWorkspaceStore } from "./workspaceStore";

interface ScreenshotStore {
  shots: Screenshot[];
  draft: CapturedScreenshot | null;
  copiedPath: string | null;
  capture: (selection?: boolean, forReport?: boolean) => Promise<boolean>;
  closeEditor: () => void;
  addShot: (shot: Screenshot) => void;
  copySaved: (shot: Screenshot) => Promise<void>;
  reveal: (shot: Screenshot) => Promise<void>;
  dismiss: (path: string) => void;
}

const MAX_SHOTS = 4;
let captureGeneration = 0;
// Re-entrancy guard only. It never reaches the UI, so keeping it out of the
// store spares every subscriber a notification per capture.
let capturing = false;
let copiedTimer: ReturnType<typeof setTimeout> | null = null;

/** Resolves once the editor window exists. The created event can fire before
 * `once` has finished registering, and a window that never reports back must
 * not leave `capturing` set, or every later shortcut press is ignored. */
async function editorOpened(editor: WebviewWindow): Promise<void> {
  let settle: (error?: unknown) => void = () => {};
  const reported = new Promise<void>((resolve, reject) => { settle = error => (error ? reject(error) : resolve()); });
  void editor.once("tauri://created", () => settle());
  void editor.once("tauri://error", event => settle(event.payload));
  let finished = false;
  const poll = (async () => {
    for (let attempt = 0; attempt < 25 && !finished; attempt++) {
      await new Promise(resolve => setTimeout(resolve, 200));
      if (await WebviewWindow.getByLabel("screenshot-editor").catch(() => null)) return;
    }
    if (!finished) throw new Error("The screenshot window did not open.");
  })();
  try { await Promise.race([reported, poll]); } finally { finished = true; void poll.catch(() => {}); }
}

export const useScreenshotStore = create<ScreenshotStore>((set) => ({
  shots: [],
  draft: null,
  copiedPath: null,

  // Nothing is drawn on screen between the shortcut and the grab: the capture
  // now includes Vibyra's own window, so any editor chrome painted first would
  // end up inside the screenshot.
  capture: async (selection = isMac, forReport = false) => {
    if (capturing) return false;
    const generation = ++captureGeneration;
    capturing = true;
    try {
      // Apple-style: pick an area, get a thumbnail in the corner. The editor
      // window only opens for a report attachment or from the thumbnail's Markup.
      if (!forReport) {
        await captureScreenshotQuick(selection);
        return true;
      }
      const existing = await WebviewWindow.getByLabel("screenshot-editor");
      if (existing) {
        await existing.setFocus();
        if (forReport) useWorkspaceStore.getState().setError("Finish the open screenshot before attaching one to a report.");
        return !forReport;
      }
      await captureScreenForEditor(selection);
      if (generation !== captureGeneration) { void finishScreenshotEdit(); return false; }
      const editor = new WebviewWindow("screenshot-editor", {
        url: `index.html?screenshot-editor=1${forReport ? "&report=1" : ""}`,
        title: "Vibyra Screenshot",
        width: 1180, height: 780, minWidth: 760, minHeight: 520,
        center: true, decorations: true, resizable: true,
        backgroundColor: "#0e0f12",
      });
      await editorOpened(editor);
      await editor.setFocus();
      return true;
    } catch (error) {
      void finishScreenshotEdit();
      if (!String(error).includes("Screen selection was cancelled")) {
        useWorkspaceStore.getState().setError(`Screenshot failed: ${String(error)}`);
      }
      return false;
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

  reveal: async (shot) => {
    try {
      await revealScreenshot(shot.path);
    } catch (error) {
      useWorkspaceStore.getState().setError(`Could not open the folder: ${String(error)}`);
    }
  },

  dismiss: (path) => {
    set((state) => ({ shots: state.shots.filter((shot) => shot.path !== path) }));
  },
}));
