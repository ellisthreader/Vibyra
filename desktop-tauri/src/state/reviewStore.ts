import { create } from "zustand";

import { githubStatus, type GithubStatus } from "../ipc/github";
import {
  reviewDiscard,
  reviewMerge,
  reviewStatus,
  type MergeOutcome,
  type WorktreeStatus,
} from "../ipc/review";
import type { PaneState } from "./terminalStoreTypes";
import { useTerminalStore } from "./terminalStore";
import { useWorkspaceStore } from "./workspaceStore";

// State for the Review dock tool. Statuses are fetched when the panel looks,
// not watched: a review is a deliberate reading moment, and the refresh
// button is honest about when the list was taken.

interface ReviewStore {
  /** The pane the panel is reviewing, or null to follow the focused pane. */
  selectedPane: number | null;
  statusByPane: Record<number, WorktreeStatus>;
  /** The last merge's result, kept until the next action replaces it. */
  outcomeByPane: Record<number, MergeOutcome>;
  loadingPane: number | null;
  /** Merge, discard and PR are single-flight, like relaunch operations. */
  busyPane: number | null;
  /** GitHub readiness for the project root last asked about. */
  github: GithubStatus | null;
  select: (paneId: number | null) => void;
  refresh: (pane: PaneState) => Promise<void>;
  refreshGithub: (projectRoot: string) => Promise<void>;
  merge: (pane: PaneState, projectRoot: string) => Promise<void>;
  discard: (pane: PaneState, projectRoot: string) => Promise<void>;
  /** The pane-header chip's action: open the dock on Review, on this pane. */
  openForPane: (paneId: number) => void;
}

function reportError(error: unknown): void {
  useWorkspaceStore.getState().setError(String(error));
}

export const useReviewStore = create<ReviewStore>((set, get) => ({
  selectedPane: null,
  statusByPane: {},
  outcomeByPane: {},
  loadingPane: null,
  busyPane: null,
  github: null,

  select: (selectedPane) => set({ selectedPane }),

  refresh: async (pane) => {
    if (!pane.workspace) return;
    set({ loadingPane: pane.id });
    try {
      const status = await reviewStatus(pane.workspace);
      set((state) => ({
        statusByPane: { ...state.statusByPane, [pane.id]: status },
      }));
    } catch (error) {
      reportError(error);
    } finally {
      set((state) => (state.loadingPane === pane.id ? { loadingPane: null } : {}));
    }
  },

  refreshGithub: async (projectRoot) => {
    try {
      set({ github: await githubStatus(projectRoot) });
    } catch {
      // GitHub readiness is a hint, never worth an error toast of its own.
      set({ github: null });
    }
  },

  merge: async (pane, projectRoot) => {
    if (!pane.workspace || get().busyPane !== null) return;
    set({ busyPane: pane.id });
    try {
      const outcome = await reviewMerge(projectRoot, pane.workspace);
      set((state) => ({
        outcomeByPane: { ...state.outcomeByPane, [pane.id]: outcome },
      }));
      await get().refresh(pane);
    } catch (error) {
      reportError(error);
    } finally {
      set({ busyPane: null });
    }
  },

  // The worktree dies with the pane: a terminal still running in a deleted
  // folder is a broken shell, so the pane is closed first, then the folder
  // and its branch go. Confirmation happened in the panel before this.
  discard: async (pane, projectRoot) => {
    if (!pane.workspace || get().busyPane !== null) return;
    set({ busyPane: pane.id });
    try {
      await useTerminalStore.getState().close(pane.id);
      await reviewDiscard(projectRoot, pane.workspace);
      set((state) => {
        const statusByPane = { ...state.statusByPane };
        const outcomeByPane = { ...state.outcomeByPane };
        delete statusByPane[pane.id];
        delete outcomeByPane[pane.id];
        return { statusByPane, outcomeByPane, selectedPane: null };
      });
    } catch (error) {
      reportError(error);
    } finally {
      set({ busyPane: null });
    }
  },

  openForPane: (paneId) => {
    set({ selectedPane: paneId });
    useWorkspaceStore.getState().setDockTool("review");
  },
}));
