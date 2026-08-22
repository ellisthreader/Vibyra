import type { StoreApi } from "zustand";

import { listAgents } from "../ipc/agents";
import { agentConversationResumable } from "../ipc/terminal";
import { inspectSafeWorkspace } from "../ipc/workspace";
import { relaunchContinuity } from "../lib/sessionRestore";
import type { PaneState, TerminalStore } from "./terminalStoreTypes";
import { useWorkspaceStore } from "./workspaceStore";

// How a pane is placed in the grid and how it is brought back from its saved
// recipe. Shared by restart (a live pane) and resume (a restored one) so the
// two can never drift apart.

type GetState = StoreApi<TerminalStore>["getState"];

function reportError(error: unknown): void {
  useWorkspaceStore.getState().setError(String(error));
}

/**
 * Relaunches a pane from its saved recipe. Shared by restart and resume so
 * both paths agree on how an agent is looked up and how a safe workspace is
 * re-checked — a fingerprint captured earlier may no longer describe the tree.
 * They differ only in what they carry over; see `relaunchContinuity`.
 */
export async function relaunch(get: GetState, pane: PaneState, replaces?: number): Promise<void> {
  // Only a suspended pane asks to continue anything, and only one carrying an
  // id names a conversation that can have gone missing since. If the check
  // itself fails, assume it is there: a broken lookup must not quietly stop
  // resuming the conversations that are.
  const conversationResumable =
    pane.status === "suspended" && pane.agentSessionId
      ? await agentConversationResumable(
          pane.agentId,
          pane.agentSessionId,
          pane.accountId,
        ).catch(() => true)
      : true;
  const { resume, replaySnapshot } = relaunchContinuity(pane, get().panes, conversationResumable);
  if (pane.agentId === "ssh") {
    await get().spawnSsh(pane.title, pane.projectId, { replaces, replaySnapshot });
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
    resume,
    replaySnapshot,
    agentSessionId: pane.agentSessionId,
    // The same login it was on. Resuming onto a different account would look
    // for this conversation in a folder that has never held it.
    accountId: pane.accountId,
  });
}
