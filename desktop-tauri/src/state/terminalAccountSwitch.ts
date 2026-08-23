import type { StoreApi } from "zustand";

import { listAgents } from "../ipc/agents";
import {
  agentConversationResumable,
  removeTerminal,
  terminalSnapshot,
} from "../ipc/terminal";
import { dropStats } from "../lib/activity";
import { suppressExitNotice } from "../lib/sessionExitNotifications";
import { isSuspendedId } from "../lib/sessionRestore";
import { destroySession } from "../lib/terminalRegistry";
import { mergeReplaySnapshots } from "../lib/terminalReplay";
import type { PaneState, TerminalStore } from "./terminalStoreTypes";
import { useWorkspaceStore } from "./workspaceStore";

type GetState = StoreApi<TerminalStore>["getState"];

/**
 * Moving one pane onto another account.
 *
 * A running CLI cannot be re-pointed: it reads its credentials once, at
 * startup. So the pane is relaunched — but relaunched *in place*, keeping its
 * slot in the grid and its output on screen, which is the difference between
 * switching accounts and losing a terminal.
 *
 * The conversation does not come with it, because it never belonged to the new
 * account: transcripts live inside whichever credential folder created them.
 * It is not destroyed either — it stays where it is, and switching back finds
 * it again. That is why this is offered rather than refused.
 */
export async function switchPaneAccount(
  get: GetState,
  id: number,
  accountId: string | null,
): Promise<void> {
  const pane = get().panes.find((candidate) => candidate.id === id);
  if (!pane || pane.accountId === accountId) return;

  const agents = await listAgents().catch(() => []);
  const agent = agents.find((candidate) => candidate.id === pane.agentId);
  if (!agent) {
    useWorkspaceStore.getState().setError(`agent "${pane.agentId}" is no longer available`);
    return;
  }

  const replaySnapshot = isSuspendedId(id)
    ? pane.snapshot ?? null
    : mergeReplaySnapshots(
        pane.snapshot,
        await terminalSnapshot(id).catch(() => null),
      );
  const launched = await get().spawnAgent(agent, pane.projectId, {
    model: pane.model,
    permissionMode: pane.permissionMode,
    reasoningEffort: pane.reasoningEffort,
    title: pane.title,
    persistenceId: pane.persistenceId,
    customTitle: pane.customTitle,
    chatTitle: pane.chatTitle,
    cwd: pane.sourceCwd,
    workspaceMode: pane.workspaceMode,
    safeSnapshotFingerprint: pane.safeSnapshotFingerprint ?? undefined,
    replaces: id,
    // What was on screen stays on screen, above whatever the new account's
    // process prints. Losing it would make a switch look like a crash.
    replaySnapshot,
    // A fresh conversation, deliberately: the old one is in the old account's
    // folder, and asking the new account to resume it would only fail.
    resume: false,
    agentSessionId: null,
    accountId,
  });
  if (!launched) return;

  // Only tear down the old account after its replacement is live. If launch
  // fails, the user keeps the terminal they already had instead of a blank,
  // process-less pane.
  suppressExitNotice(id);
  destroySession(id);
  dropStats(id);
  if (!isSuspendedId(id)) await removeTerminal(id).catch(() => {});
}

/**
 * Whether switching this pane would actually cost the user anything.
 *
 * A pane that has not started a conversation has nothing to leave behind, and
 * asking it to confirm is a prompt about nothing. Only a pane whose transcript
 * exists is worth stopping for.
 *
 * A failed lookup counts as "yes, there is something" — the safe direction is
 * to ask rather than to silently drop a conversation.
 */
export async function switchLosesConversation(pane: PaneState): Promise<boolean> {
  if (!pane.agentSessionId) return false;
  return agentConversationResumable(pane.agentId, pane.agentSessionId, pane.accountId).catch(
    () => true,
  );
}
