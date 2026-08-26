import type { StoreApi } from "zustand";

import { createSshTerminal, createTerminal, removeTerminal } from "../ipc/terminal";
import { newAgentSessionId } from "../lib/agentSessions";
import { insertPane } from "../lib/paneInsert";
import { accentFor } from "../lib/providerAccents";
import { activeAccountId, paneAccountId } from "../lib/providerAccountPolicy";
import { newPanePersistenceId } from "../lib/sessionIdentity";
import { estimateSpawnDimensions } from "../lib/spawnSize";
import { MAX_TERMINAL_PANES } from "../lib/terminalLimits";
import { destroySession } from "../lib/terminalRegistry";
import { queueReplay } from "../lib/terminalReplay";
import { useSettingsStore } from "./settingsStore";
import type { PaneState, TerminalStore } from "./terminalStoreTypes";
import { useWorkspaceStore } from "./workspaceStore";

/**
 * The account a newly opened terminal for this company should run as.
 *
 * Read at spawn rather than captured, so a terminal opened after a switch
 * belongs to the account the user moved to — the whole point of the switch
 * being to stop spending on the one they left.
 */
function launchAccountId(providerId: string): string | null {
  const { settings } = useSettingsStore.getState();
  return paneAccountId(activeAccountId(settings?.activeProviderAccounts, providerId));
}

type SpawnActions = Pick<TerminalStore, "spawnAgent" | "spawnSsh">;
type SetState = StoreApi<TerminalStore>["setState"];
type GetState = StoreApi<TerminalStore>["getState"];
let pendingNewPanes = 0;

function reportError(error: unknown): void {
  useWorkspaceStore.getState().setError(String(error));
}

function spawnDimensions(get: GetState, projectId: string) {
  const panes = get().panes.filter((pane) => pane.projectId === projectId);
  const fontSize = useSettingsStore.getState().settings?.fontSize ?? 13;
  return estimateSpawnDimensions(panes.length + 1, fontSize);
}

function reservePane(get: GetState, replacing: boolean): boolean {
  if (replacing) return true;
  if (get().panes.length + pendingNewPanes >= MAX_TERMINAL_PANES) {
    reportError(`Vibyra supports up to ${MAX_TERMINAL_PANES} open terminals`);
    return false;
  }
  pendingNewPanes += 1;
  return true;
}

async function replacementStillExists(
  get: GetState,
  id: number,
  replaces?: number,
): Promise<boolean> {
  if (replaces === undefined || get().panes.some((pane) => pane.id === replaces)) return true;
  destroySession(id);
  await removeTerminal(id).catch(() => {});
  return false;
}

export function terminalSpawnActions(set: SetState, get: GetState): SpawnActions {
  return {
    spawnAgent: async (agent, projectId, options) => {
      const adding = options?.replaces === undefined;
      if (!reservePane(get, !adding)) return false;
      try {
        const dims = spawnDimensions(get, projectId);
        const agentSessionId = options?.agentSessionId ?? newAgentSessionId(agent.id);
        // A relaunch names the account it is moving to — including `null` for
        // the first one — so only a genuinely new pane falls back to the
        // company's current choice.
        const accountId =
          options?.accountId !== undefined ? options.accountId : launchAccountId(agent.id);
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
          accountId,
        });
        if (!(await replacementStillExists(get, info.id, options?.replaces))) return false;
        const snapshot = options?.replaySnapshot
          ? queueReplay(info.id, options.replaySnapshot)
          : null;
        const pane: PaneState = {
          id: info.id,
          persistenceId: options?.persistenceId ?? newPanePersistenceId(),
          projectId,
          agentId: agent.id,
          title: options?.title ?? agent.name,
          model: options?.model ?? null,
          permissionMode: options?.permissionMode ?? "standard",
          reasoningEffort: options?.reasoningEffort ?? null,
          sourceCwd: options?.cwd ?? null,
          workspaceMode: options?.workspaceMode ?? "shared",
          safeSnapshotFingerprint: options?.safeSnapshotFingerprint ?? null,
          customTitle: options?.customTitle ?? null,
          chatTitle: options?.chatTitle ?? null,
          osc: null,
          accent: accentFor(agent.id, agent.accent),
          agentSessionId,
          accountId,
          workspace: info.workspace ?? null,
          status: "running",
          exitCode: null,
          visibility: "visible",
          lastFocusedAt: Date.now(),
          snapshot,
        };
        set((state) => insertPane(state, pane, options?.replaces));
        return true;
      } catch (error) {
        reportError(error);
        return false;
      } finally {
        if (adding) pendingNewPanes -= 1;
      }
    },

    spawnSsh: async (target, projectId, options) => {
      const adding = options?.replaces === undefined;
      if (!reservePane(get, !adding)) return false;
      try {
        const info = await createSshTerminal(target, spawnDimensions(get, projectId));
        if (!(await replacementStillExists(get, info.id, options?.replaces))) return false;
        const snapshot = options?.replaySnapshot
          ? queueReplay(info.id, options.replaySnapshot)
          : null;
        const pane: PaneState = {
          id: info.id,
          persistenceId: options?.persistenceId ?? newPanePersistenceId(),
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
          chatTitle: null,
          osc: null,
          accent: accentFor("ssh"),
          agentSessionId: null,
          accountId: null,
          workspace: null,
          status: "running",
          exitCode: null,
          visibility: "visible",
          lastFocusedAt: Date.now(),
          snapshot,
        };
        set((state) => insertPane(state, pane, options?.replaces));
        return true;
      } catch (error) {
        reportError(error);
        return false;
      } finally {
        if (adding) pendingNewPanes -= 1;
      }
    },
  };
}
