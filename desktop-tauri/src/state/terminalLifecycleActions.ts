import type { StoreApi } from "zustand";

import { removeTerminal, setTerminalVisibility } from "../ipc/terminal";
import { dropStats } from "../lib/activity";
import { suppressExitNotice } from "../lib/sessionExitNotifications";
import { isSuspendedId } from "../lib/sessionRestore";
import { destroySession, disposeTerminal } from "../lib/terminalRegistry";
import { relaunch } from "./terminalRelaunch";
import { switchPaneAccount } from "./terminalAccountSwitch";
import { runTerminalOperation } from "./terminalOperationGuard";
import { terminalSpawnActions } from "./terminalSpawnActions";
import type { TerminalStore } from "./terminalStoreTypes";
import { useWorkspaceStore } from "./workspaceStore";

type Lifecycle = Pick<
  TerminalStore,
  | "spawnAgent"
  | "spawnSsh"
  | "restart"
  | "switchAccount"
  | "resume"
  | "close"
  | "hibernate"
  | "wake"
>;
type SetState = StoreApi<TerminalStore>["setState"];
type GetState = StoreApi<TerminalStore>["getState"];

function reportError(error: unknown): void {
  useWorkspaceStore.getState().setError(String(error));
}

export function terminalLifecycleActions(set: SetState, get: GetState): Lifecycle {
  return {
    ...terminalSpawnActions(set, get),

    switchAccount: (id, accountId) =>
      runTerminalOperation(id, () => switchPaneAccount(get, id, accountId)),

    restart: (id) =>
      runTerminalOperation(id, async () => {
        const pane = get().panes.find((candidate) => candidate.id === id);
        if (!pane) return;
        // Prove the replacement opened before tearing down the working PTY.
        // A failed restart therefore leaves the existing pane usable.
        if (!(await relaunch(get, pane, id))) return;
        suppressExitNotice(id);
        destroySession(id);
        dropStats(id);
        if (!isSuspendedId(id)) await removeTerminal(id).catch(() => {});
      }),

    // Resume differs from restart in two ways: there is no live session to
    // tear down first, and the new pane takes the suspended pane's slot so
    // the grid does not reshuffle underneath the user.
    resume: (id) =>
      runTerminalOperation(id, async () => {
        const pane = get().panes.find((candidate) => candidate.id === id);
        if (!pane || pane.status !== "suspended") return;
        await relaunch(get, pane, id);
      }),

    close: async (id) => {
      // Killing a PTY still delivers an exit event. Without this, closing a pane
      // — and every restart, which closes before it respawns — would report a
      // finished or failed run the user never started.
      suppressExitNotice(id);
      destroySession(id);
      dropStats(id);
      // A suspended pane's negative id names no Rust session — sending it
      // would just be a rejected IPC call.
      if (!isSuspendedId(id)) await removeTerminal(id).catch(() => {});
      set((state) => {
        const activity = { ...state.activity };
        delete activity[id];
        return {
          panes: state.panes.filter((pane) => pane.id !== id),
          focusedId: state.focusedId === id ? null : state.focusedId,
          zoomedId: state.zoomedId === id ? null : state.zoomedId,
          activity,
        };
      });
    },

    hibernate: async (id) => {
      suppressExitNotice(id);
      disposeTerminal(id);
      set((state) => ({
        panes: state.panes.map((pane) =>
          pane.id === id ? { ...pane, visibility: "hibernated" } : pane),
        zoomedId: state.zoomedId === id ? null : state.zoomedId,
      }));
      await setTerminalVisibility(id, "hibernated").catch(reportError);
    },

    wake: async (id) => {
      set((state) => ({
        panes: state.panes.map((pane) =>
          pane.id === id ? { ...pane, visibility: "visible" } : pane),
        focusedId: id,
      }));
      await setTerminalVisibility(id, "visible").catch(reportError);
    },
  };
}
