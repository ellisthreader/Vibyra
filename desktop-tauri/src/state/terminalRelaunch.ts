import type { StoreApi } from "zustand";
import { listAgents } from "../ipc/agents";
import { agentConversationResumable, removeTerminal, terminalSnapshot } from "../ipc/terminal";
import { inspectSafeWorkspace } from "../ipc/workspace";
import { conversationInUse, resumableAgent } from "../lib/resumePolicy";
import { dropStats } from "../lib/activity";
import { suppressExitNotice } from "../lib/sessionExitNotifications";
import { destroySession } from "../lib/terminalRegistry";
import type { TerminalStore } from "./terminalStoreTypes";

type GetState = StoreApi<TerminalStore>["getState"];
type SetState = StoreApi<TerminalStore>["setState"];

/** Replace only after a successful spawn. Failed resumes leave the saved pane intact. */
export async function relaunch(set: SetState, get: GetState, id: number, continuing: boolean): Promise<void> {
  const pane = get().panes.find((candidate) => candidate.id === id);
  if (!pane || get().relaunching.includes(id) || (continuing && pane.status === "running")) return;
  set((state) => ({ relaunching: [...state.relaunching, id], relaunchErrors: { ...state.relaunchErrors, [id]: "" } }));
  try {
    if (continuing && conversationInUse(pane, get().panes, get().relaunching)) {
      throw new Error("This conversation is already open in another terminal. Continue there to keep your chat in sync.");
    }
    if (continuing && pane.agentSessionId && resumableAgent(pane.agentId)) {
      const exists = await agentConversationResumable(pane.agentId, pane.agentSessionId, pane.accountId);
      if (!exists) throw new Error("The provider's saved chat is unavailable. Your saved output is still here. You can start a new chat below.");
    }
    const replaySnapshot = continuing
      ? pane.snapshot ?? (id > 0 ? await terminalSnapshot(id).catch(() => null) : null)
      : null;
    if (pane.agentId === "ssh") {
      await get().spawnSsh(pane.title, pane.projectId, { replaces: id, replaySnapshot });
    } else {
      const agents = await listAgents();
      const agent = agents.find((candidate) => candidate.id === pane.agentId && candidate.installed);
      if (!agent) throw new Error(`${pane.agentId} is not installed. Reconnect it in Settings → Integrations, then try again.`);
      const fingerprint = pane.workspaceMode === "safe" && pane.sourceCwd && !(continuing && pane.resumeCwd)
        ? (await inspectSafeWorkspace(pane.sourceCwd)).fingerprint : undefined;
      await get().spawnAgent(agent, pane.projectId, {
        model: pane.model,
        permissionMode: pane.permissionMode,
        reasoningEffort: pane.reasoningEffort,
        title: pane.customTitle ?? pane.title,
        cwd: pane.sourceCwd,
        resumeCwd: continuing ? pane.resumeCwd : undefined,
        workspaceMode: pane.workspaceMode,
        safeSnapshotFingerprint: fingerprint,
        replaces: id,
        resume: continuing,
        replaySnapshot,
        // A new Claude chat must get a new UUID: reusing one causes "ID in use".
        agentSessionId: continuing ? pane.agentSessionId : null,
        accountId: pane.accountId,
      });
    }
    suppressExitNotice(id);
    destroySession(id);
    dropStats(id);
    if (id > 0) await removeTerminal(id).catch(() => {});
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    set((state) => ({ relaunchErrors: { ...state.relaunchErrors, [id]: message } }));
  } finally {
    set((state) => ({ relaunching: state.relaunching.filter((value) => value !== id) }));
  }
}
