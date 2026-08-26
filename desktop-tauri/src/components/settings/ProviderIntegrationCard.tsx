import { accentFor } from "../../lib/providerAccents";
import {
  connectedAccounts,
  providerIconKey,
  providerWorking,
} from "../../lib/providerAccountPolicy";
import { busyKey as accountKey } from "../../state/providerAccountStore";
import type { ProviderIntegration } from "../../providerTypes";
import { ProviderMark } from "../common/AgentMark";
import { ProviderAccountRow } from "./ProviderAccountRow";

interface Props {
  provider: ProviderIntegration;
  busyKey: string | null;
  onAddAccount: () => void;
  onInstall: () => void;
  onCancel: (account: string) => void;
  onConnect: (account: string) => void;
  onDisconnect: (account: string) => void;
  onRemove: (account: string) => void;
  onOpenSignInPage: (account: string) => void;
  onSubmit: (account: string, value: string) => void;
}

/**
 * One company's card: the CLI it needs, then every account held for it.
 *
 * The card owns whether the CLI is installed, because one install serves every
 * account. Everything else — signed in or out, which email, which plan — is
 * per account and belongs to the rows.
 */
export function ProviderIntegrationCard({
  provider,
  busyKey,
  onAddAccount,
  onInstall,
  onCancel,
  onConnect,
  onDisconnect,
  onRemove,
  onOpenSignInPage,
  onSubmit,
}: Props) {
  const installing = busyKey === accountKey(provider.id, "install");
  const adding = busyKey === accountKey(provider.id, "new");
  const connected = connectedAccounts(provider).length;

  return (
    <article className="integration-card">
      <div className="integration-card__head">
        <ProviderMark
          provider={providerIconKey(provider)}
          label={provider.company}
          accent={accentFor(provider.id)}
          size={40}
        />
        <div className="integration-card__identity">
          <div className="integration-card__title">
            <h3>{provider.company}</h3>
          </div>
          <p>
            {provider.installed
              ? `${connected} of ${provider.accounts.length} ${
                  provider.accounts.length === 1 ? "account" : "accounts"
                } signed in`
              : `Connecting a ${provider.product} account needs its command line app. Vibyra can install it.`}
          </p>
        </div>
        {provider.installed ? (
          <button
            type="button"
            className="btn btn--secondary"
            disabled={adding || !provider.canAddAccount}
            onClick={onAddAccount}
          >
            {adding ? "Starting…" : "Add account"}
          </button>
        ) : (
          <button
            type="button"
            className="btn btn--primary"
            disabled={installing || providerWorking(provider)}
            onClick={onInstall}
          >
            {installing ? "Installing…" : "Install"}
          </button>
        )}
      </div>

      {provider.installed ? (
        <div className="integration-account-list">
          {provider.accounts.map((account, index) => (
            <ProviderAccountRow
              key={account.accountId}
              provider={provider}
              account={account}
              index={index}
              busy={busyKey === accountKey(provider.id, account.accountId)}
              onCancel={() => onCancel(account.accountId)}
              onConnect={() => onConnect(account.accountId)}
              onDisconnect={() => onDisconnect(account.accountId)}
              onRemove={() => onRemove(account.accountId)}
              onOpenSignInPage={() => onOpenSignInPage(account.accountId)}
              onSubmit={(value) => onSubmit(account.accountId, value)}
            />
          ))}
          {!provider.canAddAccount ? (
            <p className="integration-install-hint">
              This is the most {provider.product} accounts Vibyra holds at once.
            </p>
          ) : null}
        </div>
      ) : (
        <div className="integration-account__foot">
          <p className="integration-install-hint">
            Runs <code>npm install -g {provider.package}</code>
          </p>
        </div>
      )}
    </article>
  );
}
