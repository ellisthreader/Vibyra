import { create } from "zustand";

import { githubStatus } from "../ipc/github";
import { reviewStatus } from "../ipc/review";
import { toggleSelection } from "../lib/reviewSelection";
import { reviewFleetActions } from "./reviewFleetActions";
import { reviewLandActions } from "./reviewLandActions";
import type { ReviewStore } from "./reviewStoreTypes";
import { useWorkspaceStore } from "./workspaceStore";

// State for the Review dock tool.
//
// The panel has two levels — a fleet of every safe-mode workspace, and one
// workspace's changeset — and this store owns which one is up. Fetches are
// deliberate rather than polled: `reviewWatch` refreshes on the edge where a
// pane stops working, because an agent going idle *is* the "ready" signal and
// a timer over six worktrees would run `git diff` forever to learn nothing.

function reportError(error: unknown): void {
  useWorkspaceStore.getState().setError(String(error));
}

// Monotonic ticket for GitHub probes: a slow response for the previous
// project must never land on top of the current one's.
let githubProbe = 0;

export const useReviewStore = create<ReviewStore>((set, get) => ({
  level: "fleet",
  selectedPane: null,
  statusByPane: {},
  outcomeByPane: {},
  rangesByPane: {},
  selectionByPane: {},
  landed: [],
  changedAt: {},
  orphans: [],
  loadingPane: null,
  busyPane: null,
  refreshingAll: false,
  github: null,

  ...reviewFleetActions(set, get),
  ...reviewLandActions(set, get),

  /** Choosing a workspace is what opens its changeset; there is no third step. */
  select: (selectedPane) =>
    set(selectedPane === null ? { selectedPane, level: "fleet" } : { selectedPane, level: "changeset" }),

  openFleet: () => set({ level: "fleet" }),

  refresh: async (pane) => {
    if (!pane.workspace) return;
    set({ loadingPane: pane.id });
    try {
      const status = await reviewStatus(pane.workspace);
      set((state) => ({
        statusByPane: { ...state.statusByPane, [pane.id]: status },
        changedAt: { ...state.changedAt, [pane.id]: Date.now() },
      }));
    } catch (error) {
      reportError(error);
    } finally {
      set((state) => (state.loadingPane === pane.id ? { loadingPane: null } : {}));
    }
  },

  refreshGithub: async (projectRoot) => {
    const probe = ++githubProbe;
    try {
      const status = await githubStatus(projectRoot);
      if (probe === githubProbe) set({ github: { root: projectRoot, status } });
    } catch {
      // GitHub readiness is a hint, never worth an error toast of its own.
      if (probe === githubProbe) set({ github: { root: projectRoot, status: null } });
    }
  },

  toggleFile: (paneId, path) =>
    set((state) => ({
      selectionByPane: {
        ...state.selectionByPane,
        [paneId]: toggleSelection(
          state.statusByPane[paneId] ?? null,
          state.selectionByPane[paneId],
          path,
        ),
      },
    })),

  setSelection: (paneId, selection) =>
    set((state) => ({
      selectionByPane: { ...state.selectionByPane, [paneId]: selection },
    })),

  openForPane: (paneId) => {
    set({ selectedPane: paneId, level: "changeset" });
    useWorkspaceStore.getState().setDockTool("review");
  },
}));
