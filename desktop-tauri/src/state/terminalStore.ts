import { useWorkspaceStore } from "./workspaceStore";
import { create } from "zustand";

import { loadTerminalSession } from "../ipc/session";
import { setTerminalVisibility } from "../ipc/terminal";
import { toPaneStates } from "../lib/sessionRestore";
import { getTerminal } from "../lib/terminalRegistry";
import type { Visibility } from "../types";
import { terminalLifecycleActions } from "./terminalLifecycleActions";
import type { PaneState, TerminalStore } from "./terminalStoreTypes";

export type { PaneState } from "./terminalStoreTypes";

export function paneLabel(pane: PaneState): string {
  return pane.customTitle || pane.title;
}

export const useTerminalStore = create<TerminalStore>((set, get) => ({
  panes: [],
  focusedId: null,
  zoomedId: null,
  activity: {},
  sessionReady: false,
  relaunching: [],
  relaunchErrors: {},
  ...terminalLifecycleActions(set, get),

  // Runs once at startup. Restored panes are suspended: their output is shown
  // but no process is launched until the user resumes one, so reopening the
  // app never spends money or takes an action on its own.
  restoreSession: async () => {
    if (get().sessionReady) return;
    const session = await loadTerminalSession();
    set({ panes: get().panes.length ? get().panes : toPaneStates(session), sessionReady: true });
  },

  toggleZoom: (id) => {
    const zoomed = get().zoomedId === id ? null : id;
    set({ zoomedId: zoomed, focusedId: id });
    const projectId = get().panes.find((pane) => pane.id === id)?.projectId;
    for (const pane of get().panes) {
      if (pane.projectId !== projectId) continue;
      if (pane.status !== "running" || pane.visibility === "hibernated") continue;
      const target: Visibility = zoomed === null || pane.id === zoomed ? "visible" : "hidden";
      if (pane.visibility !== target) {
        void setTerminalVisibility(pane.id, target).catch(() => {});
      }
    }
    set((state) => ({
      panes: state.panes.map((pane) => {
        if (pane.projectId !== projectId) return pane;
        if (pane.status !== "running" || pane.visibility === "hibernated") return pane;
        const visibility: Visibility =
          zoomed === null || pane.id === zoomed ? "visible" : "hidden";
        return { ...pane, visibility };
      }),
    }));
  },

  setFocus: (id) => {
    const workspace = useWorkspaceStore.getState();
    workspace.setProjectMode("terminals");
    if (workspace.companionOpen && workspace.companionSize === "full") workspace.toggleCompanion();
    get().markFocused(id);
    const pane = get().panes.find((p) => p.id === id);
    if (get().zoomedId !== null && get().zoomedId !== id) get().toggleZoom(id);
    if (pane?.visibility === "hibernated" && pane.status === "running") void get().wake(id);
    window.requestAnimationFrame(() => {
      if (pane?.status === "running") getTerminal(id)?.term.focus();
      else document.querySelector<HTMLButtonElement>(`[data-pane-id="${id}"] .pane-recovery .btn`)?.focus();
    });
  },

  markFocused: (id) => {
    set((state) => ({
      focusedId: id,
      panes: state.panes.map((pane) =>
        pane.id === id ? { ...pane, lastFocusedAt: Date.now() } : pane),
    }));
  },

  rename: (id, title) => {
    const customTitle = title.trim() || null;
    set((state) => ({
      panes: state.panes.map((pane) =>
        pane.id === id ? { ...pane, customTitle } : pane),
    }));
  },

  setOsc: (id, title) => {
    const osc = title.trim() || null;
    set((state) => {
      const pane = state.panes.find((candidate) => candidate.id === id);
      if (!pane || pane.osc === osc) return state;
      return {
        panes: state.panes.map((candidate) =>
          candidate.id === id ? { ...candidate, osc } : candidate),
      };
    });
  },

  markExited: (id, code) => {
    set((state) => ({
      panes: state.panes.map((pane) =>
        pane.id === id ? { ...pane, status: "exited", exitCode: code } : pane),
    }));
  },

  applyActivity: (next) => {
    const current = get().activity;
    const currentKeys = Object.keys(current);
    const nextKeys = Object.keys(next);
    const changed =
      currentKeys.length !== nextKeys.length ||
      nextKeys.some((key) => current[Number(key)] !== next[Number(key)]);
    if (changed) set({ activity: next });
  },
}));
