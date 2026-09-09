import type { StoreApi } from "zustand";
import { removeTerminal, setTerminalVisibility } from "../ipc/terminal";
import { dropStats } from "../lib/activity";
import { suppressExitNotice } from "../lib/sessionExitNotifications";
import { isSuspendedId } from "../lib/sessionRestore";
import { destroySession, disposeTerminal } from "../lib/terminalRegistry";
import { relaunch } from "./terminalRelaunch";
import { switchPaneAccount } from "./terminalAccountSwitch";
import { terminalSpawnActions } from "./terminalSpawnActions";
import type { TerminalStore } from "./terminalStoreTypes";
import { useWorkspaceStore } from "./workspaceStore";

type SetState = StoreApi<TerminalStore>["setState"];
type GetState = StoreApi<TerminalStore>["getState"];
type Lifecycle = Pick<TerminalStore, "spawnAgent" | "spawnSsh" | "restart" | "switchAccount" | "resume" | "close" | "hibernate" | "wake">;
function reportError(error: unknown): void { useWorkspaceStore.getState().setError(String(error)); }

export function terminalLifecycleActions(set: SetState, get: GetState): Lifecycle {
  return {
    ...terminalSpawnActions(set, get),
    switchAccount: (id, accountId) => switchPaneAccount(get, id, accountId),
    restart: (id) => relaunch(set, get, id, false),
    resume: (id) => relaunch(set, get, id, true),
    close: async (id) => {
      if (get().relaunching.includes(id)) return;
      // Killing a PTY still delivers an exit event. Without this, closing a pane
      // — and a restart replacing the old process — would report a
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
