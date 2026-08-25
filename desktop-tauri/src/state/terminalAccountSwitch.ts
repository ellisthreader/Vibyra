import type { StoreApi } from "zustand";

import { listAgents } from "../ipc/agents";
import { carryAgentConversation, removeTerminal, terminalSnapshot } from "../ipc/terminal";
import { dropStats } from "../lib/activity";
import { suppressExitNotice } from "../lib/sessionExitNotifications";
import { isSuspendedId } from "../lib/sessionRestore";
import { destroySession } from "../lib/terminalRegistry";
import { mergeReplaySnapshots } from "../lib/terminalReplay";
import type { TerminalStore } from "./terminalStoreTypes";
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
 * The conversation comes with it. Transcripts live inside whichever credential
 * folder created them, so the new account has never seen this chat — but a
 * transcript is only a file, and copying it across is enough for the CLI to
 * resume from it. See `conversation_carry.rs` for what was measured.
 *
 * Copied rather than moved: the chat still belongs to the account that paid
 * for it, and switching back has to find it there.
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
  // Before anything is torn down, because a conversation that cannot travel
  // changes what the relaunch is allowed to ask for.
  const carried = pane.agentSessionId
    ? await carryAgentConversation(
        pane.agentId,
        pane.agentSessionId,
        pane.accountId,
        accountId,
      ).catch(() => false)
    : false;

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
    // Only resume what the new account can actually open. Handing either CLI
    // an id it cannot resolve exits 1, which would kill the pane outright.
    resume: carried,
    agentSessionId: carried ? pane.agentSessionId : null,
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
