import { create } from "zustand";

import { checkForUpdate, downloadUpdate, installUpdate, type Update } from "../ipc/updates";
import { markPostUpdateChangelogPending } from "../lib/postUpdateChangelogPolicy";
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
  /** `true` means the feed answered, whether current or update-available. */
  check: (timeoutMs?: number) => Promise<boolean>;
  download: () => Promise<boolean>;
  /** Installs before the workspace mounts, when there is no session to save. */
  installAtStartup: () => Promise<boolean>;
  restart: () => Promise<boolean>;
  dismiss: () => void;
}

/** The `Update` handle owns a Rust-side resource, so it is kept outside the
 * store: putting it in React state invites a re-render to clone it, and a
 * cloned handle no longer maps to the resource the plugin allocated. */
let pending: Update | null = null;
let checkFlight: Promise<boolean> | null = null;
let downloadFlight: Promise<boolean> | null = null;
let installFlight: Promise<boolean> | null = null;

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

export const useUpdateStore = create<UpdateStore>((set, get) => {
  const install = (preserveSession: boolean): Promise<boolean> => {
    if (installFlight) return installFlight;
    const update = pending;
    if (
      !update || checkFlight || downloadFlight
      || !["ready", "restartError"].includes(get().status)
    ) return Promise.resolve(false);

    set({ status: "installing", error: null });
    const run = async (): Promise<boolean> => {
      try {
        // A workspace restart must flush terminal snapshots. Startup install
        // runs before terminals mount, so it neither executes nor eagerly
        // loads the terminal persistence graph.
        if (preserveSession) {
          const { saveSessionNow } = await import("../lib/sessionPersistence");
          await saveSessionNow(true);
        }
        markPostUpdateChangelogPending(update.version);
        await installUpdate(update);
        await replacePending(null);
        return true;
      } catch (error) {
        set({ status: "restartError", error: String(error) });
        return false;
      }
    };
    const flight = run().finally(() => {
      if (installFlight === flight) installFlight = null;
    });
    installFlight = flight;
    return flight;
  };

  return {
    status: "idle",
    version: "",
    notes: "",
    progress: NO_PROGRESS,
    error: null,
    checkState: "idle",
    checkError: null,
    lastCheckedAt: null,
    dismissed: "",

    check: (timeoutMs = 30_000) => {
      if (checkFlight) return checkFlight;
      if (
        downloadFlight || installFlight
        || ["downloading", "ready", "installing", "restartError"].includes(get().status)
      ) return Promise.resolve(false);

      set({ checkState: "checking", checkError: null });
      const run = async (): Promise<boolean> => {
        try {
          const update = await checkForUpdate(timeoutMs);
          const checked = {
            checkState: "done" as const,
            checkError: null,
            lastCheckedAt: Date.now(),
          };
          if (!update) {
            await replacePending(null);
            set({
              status: "idle", version: "", notes: "", progress: NO_PROGRESS,
              error: null, ...checked,
            });
            return true;
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
          return true;
        } catch (error) {
          console.warn("update check failed", error);
          set({ checkState: "failed", checkError: String(error) });
          return false;
        }
      };
      const flight = run().finally(() => {
        if (checkFlight === flight) checkFlight = null;
      });
      checkFlight = flight;
      return flight;
    },

    download: () => {
      if (downloadFlight) return downloadFlight;
      const update = pending;
      if (
        !update || checkFlight || installFlight
        || !["available", "error"].includes(get().status)
      ) return Promise.resolve(false);

      set({ status: "downloading", progress: NO_PROGRESS, error: null });
      const run = async (): Promise<boolean> => {
        try {
          await downloadUpdate(update, (event) => {
            set((state) => ({ progress: advanceProgress(state.progress, event) }));
          });
          set({ status: "ready" });
          return true;
        } catch (error) {
          set({ status: "error", error: String(error) });
          return false;
        }
      };
      const flight = run().finally(() => {
        if (downloadFlight === flight) downloadFlight = null;
      });
      downloadFlight = flight;
      return flight;
    },

    installAtStartup: () => install(false),
    // `true` is the durable boundary: every in-workspace install saves first.
    restart: () => install(true),
    dismiss: () => set((state) => ({ dismissed: state.version })),
  };
});
