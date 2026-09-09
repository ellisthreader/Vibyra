import type { StoreApi } from "zustand";
import { createSshTerminal, createTerminal } from "../ipc/terminal";
import { newAgentSessionId } from "../lib/agentSessions";
import { accentFor } from "../lib/providerAccents";
import { estimateSpawnDimensions } from "../lib/spawnSize";
import { insertPane } from "../lib/paneInsert";
import { queueReplay } from "../lib/terminalReplay";
import { sessionExitCode } from "../lib/terminalBus";
import { useSettingsStore } from "./settingsStore";
import { useWorkspaceStore } from "./workspaceStore";
import type { PaneState, TerminalStore } from "./terminalStoreTypes";

type GetState = StoreApi<TerminalStore>["getState"];
type SetState = StoreApi<TerminalStore>["setState"];
function spawnDimensions(get: GetState, projectId: string, replaces?: number) {
  const panes = get().panes.filter((pane) => pane.projectId === projectId);
  const fontSize = useSettingsStore.getState().settings?.fontSize ?? 13;
  return estimateSpawnDimensions(panes.length + (replaces === undefined ? 1 : 0), fontSize);
}
export function terminalSpawnActions(set: SetState, get: GetState): Pick<TerminalStore, "spawnAgent" | "spawnSsh"> {
  return {
    spawnAgent: async (agent, projectId, options) => {
      try {
        const dims = spawnDimensions(get, projectId, options?.replaces);
        // A resumed pane keeps the conversation it already owns; a fresh one
        // is given its own so its Resume can name it rather than ask for
        // whichever conversation in this folder happens to be newest.
        const agentSessionId = options?.agentSessionId ?? newAgentSessionId(agent.id);
        const info = await createTerminal({
          agentId: agent.id,
          cwd: options?.cwd ?? useSettingsStore.getState().settings?.projects.find((p) => p.id === projectId)?.root ?? null,
          resumeCwd: options?.resumeCwd,
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
          sourceCwd: options?.cwd ?? useSettingsStore.getState().settings?.projects.find((p) => p.id === projectId)?.root ?? info.cwd,
          resumeCwd: info.cwd,
          workspaceMode: options?.workspaceMode ?? "shared",
          safeSnapshotFingerprint: options?.safeSnapshotFingerprint ?? null,
          customTitle: null,
          osc: null,
          accent: accentFor(agent.id, agent.accent),
          agentSessionId,
          accountId: options?.accountId ?? null,
          status: sessionExitCode(info.id) !== undefined ? "exited" : "running",
          exitCode: sessionExitCode(info.id) ?? null,
          visibility: "visible",
          lastFocusedAt: Date.now(),
        };
        set((state) => insertPane(state, pane, options?.replaces));
      } catch (error) {
        if (options?.replaces !== undefined) throw error;
        useWorkspaceStore.getState().setError(String(error));
      }
    },

    spawnSsh: async (target, projectId, options) => {
      try {
        const info = await createSshTerminal(target, spawnDimensions(get, projectId, options?.replaces));
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
          status: sessionExitCode(info.id) !== undefined ? "exited" : "running",
          exitCode: sessionExitCode(info.id) ?? null,
          visibility: "visible",
          lastFocusedAt: Date.now(),
        };
        set((state) => insertPane(state, pane, options?.replaces));
      } catch (error) {
        if (options?.replaces !== undefined) throw error;
        useWorkspaceStore.getState().setError(String(error));
      }
    },

  };
}
