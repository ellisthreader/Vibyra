import { useState } from "react";

import { activeAccountId, paneAccountId } from "../../lib/providerAccountPolicy";
import {
  panesOnProvider,
  switchProviderAccount,
  workingPanes,
} from "../../state/providerAccountSwitch";
import { useSettingsStore } from "../../state/settingsStore";
import { useTerminalStore } from "../../state/terminalStore";
import type { ProviderAccount, ProviderIntegration } from "../../providerTypes";

/**
 * Choosing which of a company's logins its terminals run as.
 *
 * This is where a switch belongs rather than on the pane: running out of
 * credits is something that happens to an account, so the fix is to move
 * everything spending them at once. The row says how many terminals that is
 * before it happens, because a button that silently restarts six panes is a
 * button nobody trusts twice.
 *
 * Open chats come along — the transcript is copied into the new account, which
 * then resumes it. Gemini is the exception: its CLI can only resume its most
 * recent conversation, never one named by id, so there its chats restart.
 */

function plural(count: number): string {
  return count === 1 ? "1 terminal" : `${count} terminals`;
}

export function ProviderAccountUse({
  provider,
  account,
}: {
  provider: ProviderIntegration;
  account: ProviderAccount;
}) {
  const settings = useSettingsStore((state) => state.settings);
  const panes = useTerminalStore((state) => state.panes);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  if (account.status !== "connected") return null;

  const active =
    activeAccountId(settings?.activeProviderAccounts, provider.runtimeId) === account.accountId;
  if (active) {
    return (
      <span className="integration-account-use integration-account-use--active">In use</span>
    );
  }

  const target = paneAccountId(account.accountId);
  const moving = panesOnProvider(panes, provider.runtimeId).filter(
    (pane) => pane.accountId !== target,
  );
  const carries = provider.runtimeId !== "gemini";

  const move = async () => {
    setBusy(true);
    try {
      await switchProviderAccount(provider.runtimeId, account.accountId);
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  };

  // Only a pane mid-response is worth stopping for: a relaunch cuts off what
  // the agent was saying, and that answer does not come back.
  const choose = async () => {
    if (confirming || workingPanes(provider.runtimeId).length === 0) {
      await move();
      return;
    }
    setConfirming(true);
  };

  if (confirming) {
    const working = workingPanes(provider.runtimeId).length;
    return (
      <span className="integration-account-use integration-account-use--confirm">
        <em>
          {plural(working)} still working. Switching now stops {working === 1 ? "it" : "them"}{" "}
          mid-answer.
        </em>
        <button type="button" className="integration-account-use__keep" disabled={busy} onClick={() => setConfirming(false)}>
          Wait
        </button>
        <button type="button" className="integration-account-use__go" disabled={busy} onClick={() => void choose()}>
          Switch anyway
        </button>
      </span>
    );
  }

  return (
    <span className="integration-account-use">
      <button type="button" className="integration-account-use__go" disabled={busy} onClick={() => void choose()}>
        {busy ? "Switching…" : "Use this account"}
      </button>
      <em>
        {moving.length === 0
          ? "New terminals will run as this account."
          : carries
            ? `Moves ${plural(moving.length)}, keeping the chats open in them.`
            : `Moves ${plural(moving.length)}. Gemini cannot reopen a chat by name, so they restart.`}
      </em>
    </span>
  );
}
