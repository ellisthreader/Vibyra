import { activeAccountId, paneAccountId } from "../lib/providerAccountPolicy";
import { useSettingsStore } from "./settingsStore";
import { useTerminalStore } from "./terminalStore";
import type { PaneState } from "./terminalStoreTypes";

/**
 * Changing which account a whole company's terminals run as.
 *
 * The unit is the company, not the pane. Running out of credits happens to an
 * account, so the answer to it is to move everything that was spending them —
 * asking pane by pane would make the common case the tedious one. Terminals
 * belonging to other companies are never touched: a Claude switch has nothing
 * to say about a Codex chat.
 *
 * Each pane is relaunched in place with its conversation carried across, which
 * `switchPaneAccount` already knows how to do. This adds only the two things
 * that are true of a set rather than a single terminal: the choice outlives the
 * panes it moved, and panes are moved one at a time.
 */

/** The panes a switch would relaunch: this company's, still alive. */
export function panesOnProvider(panes: PaneState[], providerId: string): PaneState[] {
  return panes.filter((pane) => pane.agentId === providerId && pane.status !== "exited");
}

/**
 * Those of them mid-response.
 *
 * A relaunch cuts off whatever the agent was in the middle of saying, and that
 * work is not recoverable — so it is worth naming before it happens rather
 * than after. Panes waiting on the user are not busy in this sense: nothing is
 * in flight, and the question will still be there afterwards.
 */
export function workingPanes(providerId: string): PaneState[] {
  const { panes, activity } = useTerminalStore.getState();
  return panesOnProvider(panes, providerId).filter((pane) => activity[pane.id] === "working");
}

/**
 * Moves every one of this company's terminals onto `accountId`.
 *
 * Sequential, deliberately. Each switch relaunches a pane in place, which
 * rewrites the store's pane list; running them together would have each
 * relaunch deciding from a list the others were still editing.
 *
 * The setting is written first so that a pane opened while the switch is still
 * working — or after a failure part way through — lands on the account the
 * user actually chose, rather than the one they were leaving.
 */
export async function switchProviderAccount(
  providerId: string,
  accountId: string,
): Promise<number> {
  const { settings, update } = useSettingsStore.getState();
  if (settings && activeAccountId(settings.activeProviderAccounts, providerId) !== accountId) {
    await update({
      activeProviderAccounts: {
        ...settings.activeProviderAccounts,
        [providerId]: accountId,
      },
    });
  }

  const target = paneAccountId(accountId);
  const moving = panesOnProvider(useTerminalStore.getState().panes, providerId).filter(
    (pane) => pane.accountId !== target,
  );
  for (const pane of moving) {
    await useTerminalStore.getState().switchAccount(pane.id, target);
  }
  return moving.length;
}
