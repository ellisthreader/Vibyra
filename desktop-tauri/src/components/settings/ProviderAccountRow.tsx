import { useState } from "react";

import { accentFor } from "../../lib/providerAccents";
import { providerIconKey, providerStatusLabel } from "../../lib/providerAccountPolicy";
import type { ProviderAccount } from "../../types";
import { ProviderMark } from "../common/AgentMark";

interface Props {
  account: ProviderAccount;
  busy: boolean;
  onCancel: () => void;
  onConnect: () => void;
  onDisconnect: () => void;
  onOpenSignInPage: () => void;
}

export function ProviderAccountRow({
  account,
  busy,
  onCancel,
  onConnect,
  onDisconnect,
  onOpenSignInPage,
}: Props) {
  const [confirming, setConfirming] = useState(false);
  const connected = account.status === "connected";
  const connecting = account.status === "connecting";
  const providerKey = providerIconKey(account);
  const accent = accentFor(account.id);

  return (
    <article className="integration-card integration-account">
      <div className="integration-card__head">
        <ProviderMark provider={providerKey} label={account.company} accent={accent} size={40} />
        <div className="integration-card__identity">
          <div className="integration-card__title">
            <h3>{account.company}</h3>
            <span className={`integration-status integration-status--${connected ? "success" : connecting ? "working" : "neutral"}`}>
              <i aria-hidden="true" />{providerStatusLabel(account)}
            </span>
          </div>
          <p>{connected ? account.accountLabel : account.detail}</p>
          {connected && account.detail !== account.accountLabel ? <small>{account.detail}</small> : null}
        </div>
        <div className="integration-account__actions">
          {confirming ? (
            <span className="integration-account__confirm">
              <button type="button" className="btn btn--secondary" onClick={() => setConfirming(false)}>Keep</button>
              <button type="button" className="btn btn--danger" disabled={busy} onClick={onDisconnect}>Disconnect</button>
            </span>
          ) : connected ? (
            <button type="button" className="btn btn--secondary" disabled={busy} onClick={() => setConfirming(true)}>Disconnect</button>
          ) : connecting ? (
            <button type="button" className="btn btn--secondary" disabled={busy} onClick={onCancel}>Cancel</button>
          ) : (
            <button type="button" className="btn btn--primary" disabled={busy || !account.installed} onClick={onConnect}>
              {busy ? "Opening…" : "Connect account"}
            </button>
          )}
        </div>
      </div>
      {connecting ? (
        <div className="integration-card__auth-note">
          <p className="integration-card__note">Complete the secure sign-in in the browser window opened by {account.product}.</p>
          {account.signInPageAvailable ? <button type="button" className="integration-auth-link" onClick={onOpenSignInPage}>Open sign-in page</button> : null}
        </div>
      ) : null}
    </article>
  );
}
