import type { StoreApi } from "zustand";

import {
  createSshTerminal,
  createTerminal,
  removeTerminal,
  setTerminalVisibility,
} from "../ipc/terminal";
import { dropStats } from "../lib/activity";
import { newAgentSessionId } from "../lib/agentSessions";
import { accentFor } from "../lib/providerAccents";
import { suppressExitNotice } from "../lib/sessionExitNotifications";
import { isSuspendedId } from "../lib/sessionRestore";
import { estimateSpawnDimensions } from "../lib/spawnSize";
import { destroySession, disposeTerminal } from "../lib/terminalRegistry";
import { queueReplay } from "../lib/terminalReplay";
import { useSettingsStore } from "./settingsStore";
import { insertPane } from "../lib/paneInsert";
import { relaunch } from "./terminalRelaunch";
import { switchPaneAccount } from "./terminalAccountSwitch";
import type { PaneState, TerminalStore } from "./terminalStoreTypes";
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

/** Predicted PTY size for the pane the grid is about to add. */
function spawnDimensions(get: GetState, projectId: string) {
  const panes = get().panes.filter((pane) => pane.projectId === projectId);
  const fontSize = useSettingsStore.getState().settings?.fontSize ?? 13;
  return estimateSpawnDimensions(panes.length + 1, fontSize);
}

export function terminalLifecycleActions(set: SetState, get: GetState): Lifecycle {
  return {
    spawnAgent: async (agent, projectId, options) => {
      try {
        const dims = spawnDimensions(get, projectId);
        // A resumed pane keeps the conversation it already owns; a fresh one
        // is given its own so its Resume can name it rather than ask for
        // whichever conversation in this folder happens to be newest.
        const agentSessionId = options?.agentSessionId ?? newAgentSessionId(agent.id);
        const info = await createTerminal({
          agentId: agent.id,
          cwd: options?.cwd ?? null,
          rows: dims?.rows,
          cols: dims?.cols,
          model: options?.model,
          permissionMode: options?.permissionMode,
          reasoningEffort: options?.reasoningEffort,
          workspaceMode: options?.workspaceMode,
          safeSnapshotFingerprint: options?.safeSnapshotFingerprint,
          resume: options?.resume,
          agentSessionId,
          accountId: options?.accountId ?? null,
        });
        // Queued before the pane reaches the store, so it is already waiting
        // when the new pane mounts its terminal.
        if (options?.replaySnapshot) queueReplay(info.id, options.replaySnapshot);
        const pane: PaneState = {
          id: info.id,
          projectId,
          agentId: agent.id,
          title: options?.title ?? agent.name,
          model: options?.model ?? null,
          permissionMode: options?.permissionMode ?? "standard",
          reasoningEffort: options?.reasoningEffort ?? null,
          sourceCwd: options?.cwd ?? null,
          workspaceMode: options?.workspaceMode ?? "shared",
          safeSnapshotFingerprint: options?.safeSnapshotFingerprint ?? null,
          customTitle: null,
          osc: null,
          accent: accentFor(agent.id, agent.accent),
          agentSessionId,
          accountId: options?.accountId ?? null,
          status: "running",
          exitCode: null,
          visibility: "visible",
          lastFocusedAt: Date.now(),
        };
        set((state) => insertPane(state, pane, options?.replaces));
      } catch (error) {
        reportError(error);
      }
    },

    spawnSsh: async (target, projectId, options) => {
      try {
        const info = await createSshTerminal(target, spawnDimensions(get, projectId));
        if (options?.replaySnapshot) queueReplay(info.id, options.replaySnapshot);
        const pane: PaneState = {
          id: info.id,
          projectId,
          agentId: "ssh",
          title: target,
          model: null,
          permissionMode: "standard",
          reasoningEffort: null,
          sourceCwd: null,
          workspaceMode: "shared",
          safeSnapshotFingerprint: null,
          customTitle: null,
          osc: null,
          accent: accentFor("ssh"),
          agentSessionId: null,
          accountId: null,
          status: "running",
          exitCode: null,
          visibility: "visible",
          lastFocusedAt: Date.now(),
        };
        set((state) => insertPane(state, pane, options?.replaces));
      } catch (error) {
        reportError(error);
      }
    },

    switchAccount: (id, accountId) => switchPaneAccount(get, id, accountId),

    restart: async (id) => {
      const pane = get().panes.find((candidate) => candidate.id === id);
      if (!pane) return;
      await get().close(id);
      await relaunch(get, pane);
    },

    // Resume differs from restart in two ways: there is no live session to
    // tear down first, and the new pane takes the suspended pane's slot so
    // the grid does not reshuffle underneath the user.
    resume: async (id) => {
      const pane = get().panes.find((candidate) => candidate.id === id);
      if (!pane || pane.status !== "suspended") return;
      await relaunch(get, pane, id);
    },

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
