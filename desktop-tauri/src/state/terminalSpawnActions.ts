import type { StoreApi } from "zustand";
import { createSshTerminal, createTerminal, setTerminalVisibility } from "../ipc/terminal";
import { newAgentSessionId } from "../lib/agentSessions";
import { accentFor } from "../lib/providerAccents";
import { estimateSpawnDimensions } from "../lib/spawnSize";
import { insertPane } from "../lib/paneInsert";
import { queueReplay } from "../lib/terminalReplay";
import { sessionExitCode } from "../lib/terminalBus";
import { terminalFontReady } from "../lib/terminalFont";
import { useProjectStore } from "./projectStore";
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

/** Whether a new pane lands on stage: its project open in the workspace, and
 * no other pane of it zoomed over the grid (a pane it replaces keeps that
 * pane's zoom). */
function startsOnStage(get: GetState, projectId: string, replaces?: number): boolean {
  const { activeId, view } = useProjectStore.getState();
  if (projectId !== activeId || view !== "project") return false;
  const { zoomedId, panes } = get();
  if (zoomedId === null || zoomedId === replaces) return true;
  return panes.find((pane) => pane.id === zoomedId)?.projectId !== projectId;
}

/**
 * Inserts a new pane, hidden when it is not on stage. Rust flushes a visible
 * pane every frame, and one born into a project nobody is looking at would
 * keep that pace until a project switch happened to correct it. Opening its
 * project, unzooming or uncovering the stage promotes it like any other pane.
 */
function placePane(set: SetState, get: GetState, pane: PaneState, replaces?: number): void {
  const hidden = pane.status === "running" && !startsOnStage(get, pane.projectId, replaces);
  set((state) => insertPane(state, hidden ? { ...pane, visibility: "hidden" } : pane, replaces));
  if (hidden) void setTerminalVisibility(pane.id, "hidden").catch(() => {});
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
        // The pane's terminal opens the moment it reaches the store; see
        // `terminalFontReady` (already settled everywhere but a cold start).
        await terminalFontReady();
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
        placePane(set, get, pane, options?.replaces);
        return info.id;
      } catch (error) {
        if (options?.replaces !== undefined) throw error;
        useWorkspaceStore.getState().setError(String(error));
        return null;
      }
    },

    spawnSsh: async (target, projectId, options) => {
      try {
        const info = await createSshTerminal(target, spawnDimensions(get, projectId, options?.replaces));
        await terminalFontReady();
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
        placePane(set, get, pane, options?.replaces);
      } catch (error) {
        if (options?.replaces !== undefined) throw error;
        useWorkspaceStore.getState().setError(String(error));
      }
    },

  };
}
