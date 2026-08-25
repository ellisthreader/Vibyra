import { connectedAccounts, DEFAULT_ACCOUNT } from "../../lib/providerAccountPolicy";
import { useProviderAccountStore } from "../../state/providerAccountStore";
import type { PaneState } from "../../state/terminalStoreTypes";

/**
 * Which account this pane is running as.
 *
 * Read-only on purpose. Switching moved to Settings → Integrations, where it
 * applies to a company's terminals as a set — which is what running out of
 * credits actually calls for. What the pane still owes the user is the answer
 * to "did that switch reach this one", and that is this badge.
 *
 * Shown only when there is more than one login to be confused between; a
 * company with a single account would just be labelling every pane with the
 * only answer there is.
 */
export function PaneAccountBadge({ pane }: { pane: PaneState }) {
  const providers = useProviderAccountStore((state) => state.providers);

  const provider = providers.find((candidate) => candidate.runtimeId === pane.agentId);
  const accounts = provider ? connectedAccounts(provider) : [];
  if (!provider || accounts.length < 2) return null;

  const current =
    accounts.find((account) => account.accountId === (pane.accountId ?? DEFAULT_ACCOUNT)) ??
    accounts[0];

  return (
    <span className="pane__account">
      <span className="pane__account-current" title={`Running as ${current.accountLabel}`}>
        {current.accountLabel}
      </span>
    </span>
  );
}
