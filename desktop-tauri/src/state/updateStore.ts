import { create } from "zustand";

import { checkForUpdate, downloadUpdate, installUpdate, type Update } from "../ipc/updates";
import { saveSessionNow } from "../lib/sessionPersistence";
import {
  advanceProgress,
  NO_PROGRESS,
  type UpdateProgress,
  type UpdateStatus,
} from "../lib/updatePolicy";
import { shouldAnnounce, updateNotice, updateReadyNotice } from "../lib/updateNotices";
import { useNotificationStore } from "./notificationStore";

interface UpdateStore {
  status: UpdateStatus;
  version: string;
  notes: string;
  progress: UpdateProgress;
  error: string | null;
  /** Version the user waved away. In-memory only, so a newer release —
   * or the next launch — brings the banner back. */
  dismissed: string;
  /** Version already raised as a notification. Distinct from `dismissed`: the
   * feed repeats the same release on every poll, and a user who dismissed the
   * banner must not be re-notified about the build they just declined. */
  announced: string;
  /** When the feed was last asked, successfully or not. The watcher throttles
   * event-driven checks against this. */
  lastCheckedAt: number;
  check: () => Promise<void>;
  download: () => Promise<void>;
  restart: () => Promise<void>;
  /** The one-click path behind the title-bar chip and the notification button:
   * download if there is something to fetch, restart once it is staged. */
  act: () => Promise<void>;
  dismiss: () => void;
}

/** The `Update` handle owns a Rust-side resource, so it is kept outside the
 * store: putting it in React state invites a re-render to clone it, and a
 * cloned handle no longer maps to the resource the plugin allocated. */
let pending: Update | null = null;

/** Each `check()` that finds a release allocates a Rust-side resource. The
 * watcher runs every few minutes for as long as the banner is up, so dropping
 * the old handle on the floor would leak one per tick. */
async function replacePending(next: Update | null): Promise<void> {
  const previous = pending;
  pending = next;
  if (previous && previous !== next) {
    try {
      await previous.close();
    } catch {
      // A handle the backend already reclaimed is not worth reporting.
    }
  }
}

export const useUpdateStore = create<UpdateStore>((set, get) => ({
  status: "idle",
  version: "",
  notes: "",
  progress: NO_PROGRESS,
  error: null,
  dismissed: "",
  announced: "",
  lastCheckedAt: 0,

  check: async () => {
    // Never interrupt a download or a staged install to re-check.
    if (get().status === "downloading" || get().status === "ready") return;
    // Stamped before the request, not after: a check that hangs on a dead
    // network must still hold off the next wake event.
    set({ lastCheckedAt: Date.now() });
    try {
      const update = await checkForUpdate();
      if (!update) {
        await replacePending(null);
        set({ status: "idle", version: "", notes: "", error: null });
        return;
      }
      await replacePending(update);
      const notes = update.body ?? "";
      set({
        status: "available",
        version: update.version,
        notes,
        progress: NO_PROGRESS,
        error: null,
      });
      if (shouldAnnounce(get().announced, update.version)) {
        set({ announced: update.version });
        useNotificationStore.getState().push(updateNotice(update.version, notes));
      }
    } catch (error) {
      // A failed check is background noise — the network is down, or the feed
      // is briefly unavailable. Never surface it; the next tick retries.
      console.warn("update check failed", error);
    }
  },

  download: async () => {
    const update = pending;
    if (!update || get().status === "downloading") return;
    set({ status: "downloading", progress: NO_PROGRESS, error: null });
    try {
      await downloadUpdate(update, (event) => {
        set((state) => ({ progress: advanceProgress(state.progress, event) }));
      });
      set({ status: "ready" });
      // The download can finish long after the click, with the user away in
      // another app. Saying so is the difference between a staged update and
      // one that sits there unnoticed until the next launch.
      useNotificationStore.getState().push(updateReadyNotice(get().version));
    } catch (error) {
      set({ status: "error", error: String(error) });
    }
  },

  restart: async () => {
    const update = pending;
    if (!update) return;
    try {
      // `relaunch()` exits the process outright — it never raises the window
      // close event the guard listens for, so the scrollback flush that
      // normally happens on close has to happen here instead. Layout is
      // already saved continuously; snapshots are only written every two
      // minutes, and that is what would otherwise be lost.
      await saveSessionNow(true).catch(() => {});
      await installUpdate(update);
    } catch (error) {
      set({ status: "error", error: String(error) });
    }
  },

  act: async () => {
    const status = get().status;
    // "ready" is the only state that restarts. Everything else — available, or
    // a failed attempt the user is retrying — starts or resumes the download,
    // so the swap never happens on a click the user did not aim at it.
    if (status === "ready") return get().restart();
    return get().download();
  },

  dismiss: () => set((state) => ({ dismissed: state.version })),
}));
