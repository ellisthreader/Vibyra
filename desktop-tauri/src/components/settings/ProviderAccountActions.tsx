import { useState } from "react";

import { accountWorking } from "../../lib/providerAccountPolicy";
import type { ProviderAccount, ProviderIntegration } from "../../providerTypes";

interface Props {
  provider: ProviderIntegration;
  account: ProviderAccount;
  busy: boolean;
  onCancel: () => void;
  onConnect: () => void;
  onDisconnect: () => void;
  onRemove: () => void;
}

/**
 * The actions one account row offers, given where that account actually is.
 *
 * Disconnect and Remove are deliberately different things. Disconnect signs
 * the account out but keeps the row, so it can be signed back in; Remove takes
 * the whole account away, folder and all. The first account has no Remove: it
 * is the CLI's own folder, which is not Vibyra's to delete.
 */
export function ProviderAccountActions({
  provider,
  account,
  busy,
  onCancel,
  onConnect,
  onDisconnect,
  onRemove,
}: Props) {
  const [confirming, setConfirming] = useState<"disconnect" | "remove" | null>(null);

  if (confirming) {
    const remove = confirming === "remove";
    return (
      <span className="integration-account__confirm">
        <button type="button" className="btn btn--secondary" onClick={() => setConfirming(null)}>
          Keep
        </button>
        <button
          type="button"
          className="btn btn--danger"
          disabled={busy}
          onClick={remove ? onRemove : onDisconnect}
        >
          {remove ? "Remove account" : "Disconnect"}
        </button>
      </span>
    );
  }

  if (accountWorking(account)) {
    return (
      <span className="integration-account__actions">
        <button type="button" className="btn btn--secondary" disabled={busy} onClick={onCancel}>
          Cancel
        </button>
      </span>
    );
  }

  return (
    <span className="integration-account__actions">
      {account.status === "connected" ? (
        <button
          type="button"
          className="btn btn--secondary"
          disabled={busy}
          onClick={() => setConfirming("disconnect")}
        >
          Disconnect
        </button>
      ) : (
        <button
          type="button"
          className="btn btn--primary"
          disabled={busy || !provider.installed}
          onClick={onConnect}
        >
          {busy ? "Starting…" : "Sign in"}
        </button>
      )}
      {account.removable ? (
        <button
          type="button"
          className="btn btn--ghost"
          disabled={busy}
          onClick={() => setConfirming("remove")}
        >
          Remove
        </button>
      ) : null}
    </span>
  );
}
