import { accountWorking, providerStatusLabel } from "../../lib/providerAccountPolicy";
import type { ProviderAccount, ProviderIntegration } from "../../providerTypes";
import { ProviderAccountActions } from "./ProviderAccountActions";
import { ProviderAccountReply } from "./ProviderAccountReply";

interface Props {
  provider: ProviderIntegration;
  account: ProviderAccount;
  index: number;
  busy: boolean;
  onCancel: () => void;
  onConnect: () => void;
  onDisconnect: () => void;
  onRemove: () => void;
  onOpenSignInPage: () => void;
  onSubmit: (value: string) => void;
}

function tone(account: ProviderAccount): string {
  if (account.status === "connected") return "success";
  return accountWorking(account) ? "working" : "neutral";
}

/**
 * The name for one account.
 *
 * A connected account is named by the provider — its own email is the only
 * label that means anything. One that is signed out has no name to give, so it
 * is numbered by where it sits, which is also how the user just added it.
 */
function title(account: ProviderAccount, index: number): string {
  if (account.status === "connected" && account.accountLabel) return account.accountLabel;
  return index === 0 ? "First account" : `Account ${index + 1}`;
}

export function ProviderAccountRow({
  provider,
  account,
  index,
  busy,
  onCancel,
  onConnect,
  onDisconnect,
  onRemove,
  onOpenSignInPage,
  onSubmit,
}: Props) {
  return (
    <div className="integration-account-row">
      <div className="integration-account-row__identity">
        <span className="integration-account-row__name">{title(account, index)}</span>
        <span className={`integration-status integration-status--${tone(account)}`}>
          <i aria-hidden="true" />{providerStatusLabel(account)}
        </span>
        <p>{account.detail}</p>
      </div>

      <ProviderAccountActions
        provider={provider}
        account={account}
        busy={busy}
        onCancel={onCancel}
        onConnect={onConnect}
        onDisconnect={onDisconnect}
        onRemove={onRemove}
      />

      <div className="integration-account__foot">
        {account.prompt ? (
          <ProviderAccountReply prompt={account.prompt} busy={busy} onSubmit={onSubmit} />
        ) : null}
        {account.status === "connecting" && account.signInPageAvailable ? (
          <button type="button" className="integration-auth-link" onClick={onOpenSignInPage}>
            Open sign-in page
          </button>
        ) : null}
      </div>
    </div>
  );
}
