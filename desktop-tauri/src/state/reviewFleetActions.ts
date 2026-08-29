import type { StoreApi } from "zustand";

import { rangesFromDiff, type LineRange } from "../lib/reviewCollisions";
import {
  reviewFileDiff,
  reviewListWorktrees,
  reviewStatus,
  type WorktreeEntry,
} from "../ipc/review";
import type { PaneState } from "./terminalStoreTypes";
import type { ReviewStore } from "./reviewStoreTypes";

type SetState = StoreApi<ReviewStore>["setState"];
type GetState = StoreApi<ReviewStore>["getState"];

// The fleet's own fetches, split from the store the way `terminalSpawnActions`
// is split from `terminalStore`. Everything here fans out across workspaces;
// the store proper only ever acts on one.

/**
 * Contested paths only.
 *
 * The radar needs line ranges, and ranges come from diffs — but fetching every
 * file's diff for every workspace on every refresh would cost more than the
 * whole panel. The path intersection is free (it falls straight out of the
 * statuses already in hand), and only a path two workspaces share can possibly
 * collide. So the intersection picks the candidates and only those are read.
 */
function contestedPaths(panes: PaneState[], get: GetState): Map<number, string[]> {
  const owners = new Map<string, number[]>();
  for (const pane of panes) {
    for (const file of get().statusByPane[pane.id]?.changed ?? []) {
      owners.set(file.path, [...(owners.get(file.path) ?? []), pane.id]);
    }
  }
  const wanted = new Map<number, string[]>();
  for (const [path, ids] of owners) {
    if (ids.length < 2) continue;
    for (const id of ids) wanted.set(id, [...(wanted.get(id) ?? []), path]);
  }
  return wanted;
}

/** Caps the diffs one refresh may read, so a pathological fleet cannot stall. */
const MAX_RANGE_READS = 60;

export function reviewFleetActions(set: SetState, get: GetState) {
  const refreshRanges = async (panes: PaneState[]): Promise<void> => {
    const wanted = contestedPaths(panes, get);
    let budget = MAX_RANGE_READS;
    const ranges: Record<number, Record<string, LineRange[]>> = {};
    for (const pane of panes) {
      const paths = wanted.get(pane.id);
      if (!pane.workspace || !paths) continue;
      const forPane: Record<string, LineRange[]> = {};
      for (const path of paths) {
        if (budget <= 0) break;
        budget -= 1;
        try {
          forPane[path] = rangesFromDiff(await reviewFileDiff(pane.workspace, path));
        } catch {
          // A diff that will not read leaves the path without ranges, which
          // the radar reports as `touch` rather than guessing at a collision.
        }
      }
      ranges[pane.id] = forPane;
    }
    set({ rangesByPane: ranges });
  };

  return {
    /**
     * Every reviewable pane's changeset, then the ranges the radar needs.
     *
     * Single-flight: the watcher and the panel both call this, and two fans
     * running at once would double every git process for no new information.
     */
    refreshAll: async (panes: PaneState[]): Promise<void> => {
      if (get().refreshingAll) return;
      set({ refreshingAll: true });
      try {
        const stamped = Date.now();
        for (const pane of panes) {
          if (!pane.workspace) continue;
          try {
            const status = await reviewStatus(pane.workspace);
            set((state) => ({
              statusByPane: { ...state.statusByPane, [pane.id]: status },
              changedAt: { ...state.changedAt, [pane.id]: stamped },
            }));
          } catch {
            // One unreadable workspace must not cost the rest of the fleet
            // its refresh; the row simply stays stale and says so.
          }
        }
        await refreshRanges(panes);
      } finally {
        set({ refreshingAll: false });
      }
    },

    /** The `vibyra/*` worktrees on disk, so orphans become reachable. */
    refreshOrphans: async (projectRoot: string): Promise<void> => {
      try {
        const entries: WorktreeEntry[] = await reviewListWorktrees(projectRoot);
        set({ orphans: entries.filter((entry) => entry.exists) });
      } catch {
        // Listing is a convenience, never worth an error toast of its own.
        set({ orphans: [] });
      }
    },
  };
}
