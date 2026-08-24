import type { StoreApi } from "zustand";

import { removeTerminal, setTerminalVisibility } from "../ipc/terminal";
import { dropStats } from "../lib/activity";
import { forgetResumeAttempt } from "../lib/resumeRecovery";
import { suppressExitNotice } from "../lib/sessionExitNotifications";
import type { RelaunchContinuity } from "../lib/sessionRestore";
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
  | "recoverResume"
  | "close"
  | "hibernate"
  | "wake"
>;
type SetState = StoreApi<TerminalStore>["setState"];
type GetState = StoreApi<TerminalStore>["getState"];

function reportError(error: unknown): void {
  useWorkspaceStore.getState().setError(String(error));
}

/**
 * Swaps a pane for a fresh one in the same slot.
 *
 * The replacement is proved to have opened before the working PTY is torn
 * down, so a relaunch that fails leaves the existing pane usable rather than
 * closing it over an error.
 */
async function replacePane(
  get: GetState,
  id: number,
  continuity?: RelaunchContinuity,
): Promise<void> {
  const pane = get().panes.find((candidate) => candidate.id === id);
  if (!pane) return;
  if (!(await relaunch(get, pane, id, continuity))) return;
  suppressExitNotice(id);
  destroySession(id);
  dropStats(id);
  if (!isSuspendedId(id)) await removeTerminal(id).catch(() => {});
}

export function terminalLifecycleActions(set: SetState, get: GetState): Lifecycle {
  return {
    ...terminalSpawnActions(set, get),

    switchAccount: (id, accountId) =>
      runTerminalOperation(id, () => switchPaneAccount(get, id, accountId)),

    restart: (id) => runTerminalOperation(id, () => replacePane(get, id)),

    // A resume the agent refused. The replacement is a restart in every
    // respect but one: the conversation is deliberately left behind while the
    // output the user was reading carries over. Losing the thread is the
    // failure — losing the terminal with it is what made it an outage.
    recoverResume: (id) =>
      runTerminalOperation(id, async () => {
        const pane = get().panes.find((candidate) => candidate.id === id);
        if (!pane) return;
        await replacePane(get, id, { resume: false, replaySnapshot: pane.snapshot ?? null });
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
      // Nor is a pane the user closed a resume that failed, however soon after
      // launch they closed it.
      const closing = get().panes.find((candidate) => candidate.id === id);
      if (closing) forgetResumeAttempt(closing.persistenceId);
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
