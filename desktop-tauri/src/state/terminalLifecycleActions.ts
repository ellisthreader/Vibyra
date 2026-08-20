import type { StoreApi } from "zustand";

import { listAgents } from "../ipc/agents";
import {
  createSshTerminal,
  createTerminal,
  removeTerminal,
  setTerminalVisibility,
} from "../ipc/terminal";
import { inspectSafeWorkspace } from "../ipc/workspace";
import { dropStats } from "../lib/activity";
import { accentFor } from "../lib/providerAccents";
import { isSuspendedId } from "../lib/sessionRestore";
import { estimateSpawnDimensions } from "../lib/spawnSize";
import { destroySession, disposeTerminal } from "../lib/terminalRegistry";
import { useSettingsStore } from "./settingsStore";
import { useWorkspaceStore } from "./workspaceStore";
import type { PaneState, TerminalStore } from "./terminalStoreTypes";

type Lifecycle = Pick<
  TerminalStore,
  "spawnAgent" | "spawnSsh" | "restart" | "resume" | "close" | "hibernate" | "wake"
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

/**
 * Places a freshly spawned pane. With `replaces` it takes that pane's slot and
 * inherits focus/zoom from it, so resuming never reorders the grid; otherwise
 * it is appended.
 */
function insertPane(
  state: TerminalStore,
  pane: PaneState,
  replaces?: number,
): Partial<TerminalStore> {
  if (replaces === undefined) {
    return { panes: [...state.panes, pane], focusedId: pane.id };
  }
  const activity = { ...state.activity };
  delete activity[replaces];
  return {
    panes: state.panes.map((candidate) => (candidate.id === replaces ? pane : candidate)),
    focusedId: pane.id,
    zoomedId: state.zoomedId === replaces ? pane.id : state.zoomedId,
    activity,
  };
}

/**
 * Relaunches a pane from its saved recipe. Shared by restart and resume so
 * both paths agree on how an agent is looked up and how a safe workspace is
 * re-checked — a fingerprint captured earlier may no longer describe the tree.
 */
async function relaunch(get: GetState, pane: PaneState, replaces?: number): Promise<void> {
  if (pane.agentId === "ssh") {
    await get().spawnSsh(pane.title, pane.projectId);
    return;
  }
  const agents = await listAgents().catch(() => []);
  const agent = agents.find((candidate) => candidate.id === pane.agentId);
  if (!agent) {
    reportError(`agent "${pane.agentId}" is no longer available`);
    return;
  }
  let fingerprint = pane.safeSnapshotFingerprint ?? undefined;
  if (pane.workspaceMode === "safe" && pane.sourceCwd) {
    fingerprint = await inspectSafeWorkspace(pane.sourceCwd)
      .then((preflight) => preflight.fingerprint)
      .catch(() => fingerprint);
  }
  await get().spawnAgent(agent, pane.projectId, {
    model: pane.model,
    permissionMode: pane.permissionMode,
    reasoningEffort: pane.reasoningEffort,
    title: pane.customTitle ?? pane.title,
    cwd: pane.sourceCwd,
    workspaceMode: pane.workspaceMode,
    safeSnapshotFingerprint: fingerprint,
    replaces,
  });
}

export function terminalLifecycleActions(set: SetState, get: GetState): Lifecycle {
  return {
    spawnAgent: async (agent, projectId, options) => {
      try {
        const dims = spawnDimensions(get, projectId);
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
        });
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

    spawnSsh: async (target, projectId) => {
      try {
        const info = await createSshTerminal(target, spawnDimensions(get, projectId));
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
          status: "running",
          exitCode: null,
          visibility: "visible",
          lastFocusedAt: Date.now(),
        };
        set((state) => ({ panes: [...state.panes, pane], focusedId: info.id }));
      } catch (error) {
        reportError(error);
      }
    },

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
