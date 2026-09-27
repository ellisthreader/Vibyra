import { accountWorking, providerStatusLabel } from "../../lib/providerAccountPolicy";
import type { ProviderAccount, ProviderIntegration } from "../../providerTypes";
import { CheckIcon } from "../common/Icons";
import { ProviderAccountActions } from "./ProviderAccountActions";
import { ProviderAccountReply } from "./ProviderAccountReply";

interface Props {
  provider: ProviderIntegration;
  account: ProviderAccount;
  index: number;
  busy: boolean;
  /** The account new terminals run as. Click a signed-in row to change it. */
  selected: boolean;
  onSelect: () => void;
  onCancel: () => void;
  onConnect: () => void;
  onDisconnect: () => void;
  onRemove: () => void;
  onOpenSignInPage: () => void;
  onSubmit: (value: string) => void;
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

function detail(account: ProviderAccount): string {
  if (account.status === "sign-in-required" && account.removable) return "Not signed in";
  if (account.status === "connected") return account.detail;
  return `${providerStatusLabel(account)} · ${account.detail}`;
}

/**
 * One flat line per account. A signed-in row is a radio: the tick marks the
 * one new terminals use, and clicking another moves it. The only other thing
 * on the line is the single action that state allows.
 */
export function ProviderAccountRow({
  provider,
  account,
  index,
  busy,
  selected,
  onSelect,
  onCancel,
  onConnect,
  onDisconnect,
  onRemove,
  onOpenSignInPage,
  onSubmit,
}: Props) {
  const connected = account.status === "connected";
  const cls = ["integration-account-row", selected ? "integration-account-row--selected" : "", connected ? "integration-account-row--pick" : ""].join(" ").trim();
  return (
    <div className={cls}>
      <button
        type="button"
        className="integration-account-row__identity"
        role={connected ? "radio" : undefined}
        aria-checked={connected ? selected : undefined}
        disabled={!connected}
        onClick={connected ? onSelect : undefined}
      >
        <span className="integration-account-row__mark" aria-hidden="true">
          {selected ? <CheckIcon size={12} /> : null}
        </span>
        <span className="integration-account-row__name">{title(account, index)}</span>
        <span className="integration-account-row__detail">{detail(account)}</span>
        {accountWorking(account) ? <span className="integration-status integration-status--working"><i aria-hidden="true" />{providerStatusLabel(account)}</span> : null}
      </button>

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
