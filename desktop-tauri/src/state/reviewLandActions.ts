import type { StoreApi } from "zustand";

import { reviewDiscard, reviewMerge } from "../ipc/review";
import { selectedPaths } from "../lib/reviewSelection";
import type { PaneState } from "./terminalStoreTypes";
import type { ReviewStore } from "./reviewStoreTypes";
import { useTerminalStore } from "./terminalStore";
import { useWorkspaceStore } from "./workspaceStore";

type SetState = StoreApi<ReviewStore>["setState"];
type GetState = StoreApi<ReviewStore>["getState"];

// How a review ends. Both actions write to the user's own project, so both are
// single-flight and both are confirmed in the panel before they reach here.

function reportError(error: unknown): void {
  useWorkspaceStore.getState().setError(String(error));
}

export function reviewLandActions(set: SetState, get: GetState) {
  return {
    /**
     * Lands the ticked files as ordinary working-tree edits.
     *
     * A pane that lands joins `landed`, which is what lets the radar re-grade
     * everyone else's overlap on those paths from a warning into a conflict —
     * their patches now have to apply over this one.
     */
    merge: async (pane: PaneState, projectRoot: string): Promise<void> => {
      if (!pane.workspace || get().busyPane !== null) return;
      const status = get().statusByPane[pane.id] ?? null;
      const paths = selectedPaths(status, get().selectionByPane[pane.id]);
      if (paths.length === 0) return;
      set({ busyPane: pane.id });
      try {
        const outcome = await reviewMerge(projectRoot, pane.workspace, paths);
        set((state) => ({
          outcomeByPane: { ...state.outcomeByPane, [pane.id]: outcome },
          landed: outcome.applied && !state.landed.includes(pane.id)
            ? [...state.landed, pane.id]
            : state.landed,
          // A landed selection has served its purpose; whatever is left in the
          // workspace starts again as "everything", not as yesterday's ticks.
          selectionByPane: outcome.applied
            ? { ...state.selectionByPane, [pane.id]: undefined }
            : state.selectionByPane,
        }));
        await get().refresh(pane);
      } catch (error) {
        reportError(error);
      } finally {
        set({ busyPane: null });
      }
    },

    /**
     * Removes the worktree and its branch, then closes the pane.
     *
     * The order is load-bearing and used to be the other way round: closing
     * first meant a native failure left the pane gone *and* the worktree
     * stranded, with nothing in the app able to reach it again. Removing
     * first fails safe — the pane and its route both survive. A shell whose
     * directory has just been unlinked is broken either way, which is why the
     * close still follows immediately.
     */
    discard: async (pane: PaneState, projectRoot: string): Promise<void> => {
      if (!pane.workspace || get().busyPane !== null) return;
      set({ busyPane: pane.id });
      try {
        await reviewDiscard(projectRoot, pane.workspace);
        await useTerminalStore.getState().close(pane.id);
        set((state) => {
          const statusByPane = { ...state.statusByPane };
          const outcomeByPane = { ...state.outcomeByPane };
          const selectionByPane = { ...state.selectionByPane };
          delete statusByPane[pane.id];
          delete outcomeByPane[pane.id];
          delete selectionByPane[pane.id];
          return {
            statusByPane,
            outcomeByPane,
            selectionByPane,
            landed: state.landed.filter((id) => id !== pane.id),
            selectedPane: null,
            level: "fleet" as const,
          };
        });
      } catch (error) {
        reportError(error);
      } finally {
        set({ busyPane: null });
      }
    },
  };
}
