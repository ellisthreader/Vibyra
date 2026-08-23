import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { create } from "zustand";

import { submitReport } from "../ipc/report";
import { gatherSurroundings, type ReportSurroundings } from "../lib/reportContext";
import { canSubmit, emptyDraft, MAX_IMAGES, type ReportDraft } from "../lib/reportDraft";
import { readClipboardPaste } from "../ipc/tools";
import { useScreenshotStore } from "./screenshotStore";

type ReportStatus = "idle" | "sending" | "sent";

interface ReportStore {
  open: boolean;
  draft: ReportDraft | null;
  surroundings: ReportSurroundings | null;
  status: ReportStatus;
  error: string | null;
  sentId: string | null;
  /** True while the screenshot editor stands in for the dialog. */
  capturing: boolean;
  begin: (prefill?: Partial<ReportDraft>) => Promise<void>;
  close: () => void;
  patch: (patch: Partial<ReportDraft>) => void;
  addScreenshot: () => Promise<void>;
  addImages: () => Promise<void>;
  pasteImage: () => Promise<boolean>;
  removeImage: (path: string) => void;
  applyScreenshot: (dataUrl: string) => void;
  cancelScreenshot: () => void;
  submit: () => Promise<void>;
}

/** Lets React paint a frame without the dialog before the screen is grabbed —
 * otherwise the report dialog is the most prominent thing in its own
 * screenshot, covering the very thing being reported. */
function nextPaint(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}

function trimmed(value: string): string | null {
  const text = value.trim();
  return text ? text : null;
}

export const useReportStore = create<ReportStore>((set, get) => ({
  open: false,
  draft: null,
  surroundings: null,
  status: "idle",
  error: null,
  sentId: null,
  capturing: false,

  begin: async (prefill) => {
    // Opened first, filled a moment later: gathering the surroundings costs an
    // IPC round trip, and a dialog that appears only after it feels broken.
    set({ open: true, status: "idle", error: null, sentId: null });
    const surroundings = await gatherSurroundings();
    const reporter = surroundings.context.reporter ?? "";
    // The user can close the dialog while this is in flight; filling it in
    // afterwards would leave a draft behind that the next report inherits.
    if (!get().open) return;
    set((state) => ({
      surroundings,
      draft: state.draft ?? { ...emptyDraft(surroundings.area, reporter), ...prefill },
    }));
  },

  // Deliberately keeps the draft. Clicking the backdrop or pressing Escape
  // with a paragraph typed is an accident, not an intention to throw it away —
  // reopening restores it. A sent report clears it instead, below.
  close: () => set({ open: false, status: "idle", error: null }),

  patch: (patch) => {
    const draft = get().draft;
    if (draft) set({ draft: { ...draft, ...patch }, error: null });
  },

  addScreenshot: async () => {
    if (get().capturing) return;
    set({ capturing: true });
    await nextPaint();
    await useScreenshotStore.getState().capture();
    // The capture can fail (no compositor, permission refused); the editor
    // never opens, so hand the dialog back rather than stranding the user.
    if (!useScreenshotStore.getState().draft) set({ capturing: false });
  },

  // Paths rather than bytes all the way through: the picker hands back a
  // path, and so does a pasted image (Rust spools the clipboard to a file), so
  // one code path covers both and neither moves a picture through the webview.
  addImages: async () => {
    const draft = get().draft;
    if (!draft) return;
    const room = MAX_IMAGES - draft.images.length;
    if (room <= 0) return;
    const picked = await openDialog({
      multiple: true,
      title: "Attach images to this report",
      filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg", "gif", "webp", "bmp"] }],
    }).catch(() => null);
    const paths = (Array.isArray(picked) ? picked : picked ? [picked] : []).filter(
      (path): path is string => typeof path === "string",
    );
    if (!paths.length) return;
    const current = get().draft;
    if (!current) return;
    const fresh = paths.filter((path) => !current.images.includes(path)).slice(0, room);
    set({ draft: { ...current, images: [...current.images, ...fresh] }, error: null });
  },

  /** Ctrl+V inside the dialog. Answers whether an image was actually taken, so
   * the caller can leave a text paste alone. */
  pasteImage: async () => {
    const draft = get().draft;
    if (!draft || draft.images.length >= MAX_IMAGES) return false;
    const paste = await readClipboardPaste().catch(() => null);
    if (paste?.kind !== "image" || draft.images.includes(paste.path)) return false;
    set({ draft: { ...draft, images: [...draft.images, paste.path] }, error: null });
    return true;
  },

  removeImage: (path) => {
    const draft = get().draft;
    if (draft) set({ draft: { ...draft, images: draft.images.filter((entry) => entry !== path) } });
  },

  applyScreenshot: (dataUrl) => {
    const draft = get().draft;
    set({ capturing: false, draft: draft ? { ...draft, screenshot: dataUrl } : draft });
    useScreenshotStore.getState().closeEditor();
  },

  cancelScreenshot: () => set({ capturing: false }),

  submit: async () => {
    const { draft, surroundings } = get();
    if (!draft || !surroundings || !canSubmit(draft) || get().status === "sending") return;
    set({ status: "sending", error: null });
    try {
      const sentId = await submitReport({
        kind: draft.kind,
        severity: draft.severity,
        summary: draft.summary.trim(),
        details: draft.details.trim(),
        steps: trimmed(draft.steps),
        expected: trimmed(draft.expected),
        area: trimmed(draft.area),
        contact: trimmed(draft.contact),
        context: surroundings.context,
        screenshot: draft.screenshot,
        imagePaths: draft.images,
        sessionId: draft.includeTerminal ? surroundings.sessionId : null,
      });
      set({ status: "sent", sentId, draft: null });
    } catch (error) {
      set({ status: "idle", error: String(error) });
    }
  },
}));
