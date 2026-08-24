import { create } from "zustand";

import { checkForUpdate, downloadUpdate, installUpdate, type Update } from "../ipc/updates";
import { saveSessionNow } from "../lib/sessionPersistence";
import type { CheckState } from "../lib/updateCheckPolicy";
import {
  advanceProgress,
  NO_PROGRESS,
  type UpdateProgress,
  type UpdateStatus,
} from "../lib/updatePolicy";

interface UpdateStore {
  status: UpdateStatus;
  version: string;
  notes: string;
  progress: UpdateProgress;
  error: string | null;
  /** State of the check request itself, tracked apart from `status` so a feed
   * that has been unreachable for days is visible in Settings → Updates
   * without the banner claiming a release exists. */
  checkState: CheckState;
  checkError: string | null;
  /** Epoch ms of the last check that reached the feed and got an answer. */
  lastCheckedAt: number | null;
  /** Version the user waved away. In-memory only, so a newer release —
   * or the next launch — brings the banner back. */
  dismissed: string;
  check: () => Promise<void>;
  download: () => Promise<void>;
  restart: () => Promise<void>;
  dismiss: () => void;
}

/** The `Update` handle owns a Rust-side resource, so it is kept outside the
 * store: putting it in React state invites a re-render to clone it, and a
 * cloned handle no longer maps to the resource the plugin allocated. */
let pending: Update | null = null;

/** Each `check()` that finds a release allocates a Rust-side resource. The
 * watcher runs every 20 minutes for as long as the banner is up, so dropping
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
  checkState: "idle",
  checkError: null,
  lastCheckedAt: null,
  dismissed: "",

  check: async () => {
    // Never interrupt a download or a staged install to re-check.
    if (["downloading", "ready", "installing", "restartError"].includes(get().status)) return;
    set({ checkState: "checking" });
    try {
      const update = await checkForUpdate();
      const checked = { checkState: "done" as const, checkError: null, lastCheckedAt: Date.now() };
      if (!update) {
        await replacePending(null);
        set({ status: "idle", version: "", notes: "", error: null, ...checked });
        return;
      }
      await replacePending(update);
      set({
        status: "available",
        version: update.version,
        notes: update.body ?? "",
        progress: NO_PROGRESS,
        error: null,
        ...checked,
      });
    } catch (error) {
      // Still background noise for the banner and the titlebar chip — a single
      // missed tick is not worth interrupting anyone, and the next one retries.
      // It is recorded rather than swallowed so Settings → Updates can say the
      // check is failing, which is otherwise indistinguishable from being current.
      console.warn("update check failed", error);
      set({ checkState: "failed", checkError: String(error) });
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
    } catch (error) {
      set({ status: "error", error: String(error) });
    }
  },

  restart: async () => {
    const update = pending;
    if (!update || !["ready", "restartError"].includes(get().status)) return;
    set({ status: "installing", error: null });
    try {
      // `relaunch()` exits the process outright — it never raises the window
      // close event the guard listens for, so the scrollback flush that
      // normally happens on close has to happen here instead. Layout is
      // already saved continuously; snapshots are only written every two
      // minutes, and that is what would otherwise be lost.
      await saveSessionNow(true);
      await installUpdate(update);
    } catch (error) {
      set({ status: "restartError", error: String(error) });
    }
  },

  dismiss: () => set((state) => ({ dismissed: state.version })),
}));
