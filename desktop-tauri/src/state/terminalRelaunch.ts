import type { StoreApi } from "zustand";

import { listAgents } from "../ipc/agents";
import { agentConversationResumable } from "../ipc/terminal";
import { inspectSafeWorkspace } from "../ipc/workspace";
import { notifyNewConversation } from "../lib/notificationTriggers";
import { noteResumeAttempt, startsNewConversation } from "../lib/resumeRecovery";
import type { RelaunchContinuity } from "../lib/sessionRestore";
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
 * Only a suspended pane asks to continue anything, and only one carrying an id
 * names a conversation that can have gone missing since. If the check itself
 * fails, assume it is there: a broken lookup must not quietly stop resuming
 * the conversations that are.
 */
async function resolveContinuity(get: GetState, pane: PaneState): Promise<RelaunchContinuity> {
  const conversationResumable =
    pane.status === "suspended" && pane.agentSessionId
      ? await agentConversationResumable(
          pane.agentId,
          pane.agentSessionId,
          pane.accountId,
        ).catch(() => true)
      : true;
  return relaunchContinuity(pane, get().panes, conversationResumable);
}

/**
 * Relaunches a pane from its saved recipe. Shared by restart and resume so
 * both paths agree on how an agent is looked up and how a safe workspace is
 * re-checked — a fingerprint captured earlier may no longer describe the tree.
 * They differ only in what they carry over; see `relaunchContinuity`.
 *
 * `override` exists for one case: a resume the agent refused. That pane's
 * recipe is fine and its scrollback is real work, but its conversation has
 * just proved unusable, so the decision is handed in rather than derived again
 * from a pane whose status now says `exited`.
 */
export async function relaunch(
  get: GetState,
  pane: PaneState,
  replaces?: number,
  override?: RelaunchContinuity,
): Promise<boolean> {
  const { resume, replaySnapshot } = override ?? (await resolveContinuity(get, pane));
  if (startsNewConversation(pane, resume)) notifyNewConversation(pane);
  if (pane.agentId === "ssh") {
    return get().spawnSsh(pane.title, pane.projectId, {
      replaces,
      replaySnapshot,
      persistenceId: pane.persistenceId,
    });
  }
  const agents = await listAgents().catch(() => []);
  const agent = agents.find((candidate) => candidate.id === pane.agentId);
  if (!agent) {
    reportError(`agent "${pane.agentId}" is no longer available`);
    return false;
  }
  let fingerprint = pane.safeSnapshotFingerprint ?? undefined;
  if (pane.workspaceMode === "safe" && pane.sourceCwd) {
    fingerprint = await inspectSafeWorkspace(pane.sourceCwd)
      .then((preflight) => preflight.fingerprint)
      .catch(() => fingerprint);
  }
  // Recorded before the process can exit, and only for agents that are
  // actually given the flag — `spawnSsh` above has no conversation to continue.
  if (resume) noteResumeAttempt(pane.persistenceId);
  return get().spawnAgent(agent, pane.projectId, {
    model: pane.model,
    permissionMode: pane.permissionMode,
    reasoningEffort: pane.reasoningEffort,
    title: pane.title,
    persistenceId: pane.persistenceId,
    customTitle: pane.customTitle,
    chatTitle: pane.chatTitle,
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
