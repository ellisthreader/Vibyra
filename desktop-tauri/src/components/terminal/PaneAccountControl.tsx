import { useState } from "react";

import { connectedAccounts } from "../../lib/providerAccountPolicy";
import { useProviderAccountStore } from "../../state/providerAccountStore";
import { switchLosesConversation } from "../../state/terminalAccountSwitch";
import { useTerminalStore } from "../../state/terminalStore";
import type { PaneState } from "../../state/terminalStoreTypes";

/**
 * Which account this pane is running as, and how to move it to another.
 *
 * Shown only when there is a choice: a company with one signed-in account has
 * nothing to switch to, and a badge saying so would be noise on every pane.
 *
 * A running CLI cannot change account, so switching relaunches the pane — in
 * its own slot, with its output kept. When the pane has not started a
 * conversation there is nothing to lose and it just happens; when it has, the
 * button asks once and says plainly where that conversation stays.
 */
export function PaneAccountControl({ pane }: { pane: PaneState }) {
  const providers = useProviderAccountStore((state) => state.providers);
  const switchAccount = useTerminalStore((state) => state.switchAccount);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const provider = providers.find((candidate) => candidate.runtimeId === pane.agentId);
  const accounts = provider ? connectedAccounts(provider) : [];
  if (!provider || accounts.length < 2) return null;

  const current =
    accounts.find((account) => account.accountId === (pane.accountId ?? "default")) ?? accounts[0];
  const others = accounts.filter((account) => account.accountId !== current.accountId);

  const move = async (accountId: string) => {
    setBusy(true);
    try {
      await switchAccount(pane.id, accountId === "default" ? null : accountId);
    } finally {
      setBusy(false);
      setConfirming(null);
    }
  };

  const choose = async (accountId: string) => {
    if (confirming === accountId) {
      await move(accountId);
      return;
    }
    if (await switchLosesConversation(pane)) {
      setConfirming(accountId);
      return;
    }
    await move(accountId);
  };

  const pending = others.find((account) => account.accountId === confirming);

  return (
    <span className="pane__account">
      <span className="pane__account-current" title={`Running as ${current.accountLabel}`}>
        {current.accountLabel}
      </span>
      {pending ? (
        <span className="pane__account-confirm">
          <em>
            This conversation stays with {current.accountLabel}. Switching starts a new one — you
            can switch back to find it.
          </em>
          <button type="button" className="icon-btn" disabled={busy} onClick={() => setConfirming(null)}>
            Keep
          </button>
          <button
            type="button"
            className="icon-btn icon-btn--danger"
            disabled={busy}
            onClick={() => void choose(pending.accountId)}
          >
            Switch
          </button>
        </span>
      ) : (
        others.map((account) => (
          <button
            key={account.accountId}
            type="button"
            className="pane__account-switch"
            disabled={busy}
            title={`Relaunch this terminal as ${account.accountLabel}`}
            onClick={() => void choose(account.accountId)}
          >
            {account.accountLabel}
          </button>
        ))
      )}
    </span>
  );
}
