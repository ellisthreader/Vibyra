import { accentFor } from "../../lib/providerAccents";
import {
  connectedAccounts,
  providerIconKey,
  providerWorking,
} from "../../lib/providerAccountPolicy";
import { busyKey as accountKey } from "../../state/providerAccountStore";
import { useProviderDefaultStore } from "../../state/providerDefaultStore";
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
 * One company: the CLI it needs, then every account held for it.
 *
 * The card owns whether the CLI is installed, because one install serves every
 * account. Which account new terminals run as is chosen by clicking a signed-in
 * row; the tick is the whole UI for it. Add account only appears once the
 * first account is signed in: a second empty row is not an account, it is
 * clutter. Duplicate sign-ins are removed by the pane before they get here.
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
  const connected = connectedAccounts(provider);
  const chosen = useProviderDefaultStore((s) => s.byRuntime[provider.runtimeId]);
  const setDefault = useProviderDefaultStore((s) => s.setDefault);
  // The default is whichever the user picked, else the first signed-in one —
  // the same fallback the launcher uses, so the chip never lies.
  const defaultId = connected.find((a) => a.accountId === chosen)?.accountId ?? connected[0]?.accountId ?? null;

  return (
    <article className="integration-card integration-account">
      <div className="integration-card__head">
        <ProviderMark provider={providerIconKey(provider)} label={provider.company} accent={accentFor(provider.id)} size={30} />
        <div className="integration-card__identity">
          <div className="integration-card__title"><h3>{provider.company}</h3></div>
          <p>
            {!provider.installed
              ? `Needs the ${provider.product} command line app.`
              : connected.length === 0
                ? `Sign in to use your ${provider.product} account in terminals.`
                : connected.length === 1
                  ? "1 account signed in"
                  : `${connected.length} accounts signed in · new terminals use the ticked one`}
          </p>
        </div>
        {provider.installed ? (
          connected.length > 0 && provider.canAddAccount ? (
            <button type="button" className="btn btn--ghost integration-add" disabled={adding} onClick={onAddAccount}>
              {adding ? "Starting…" : "Add account"}
            </button>
          ) : null
        ) : (
          <button type="button" className="btn btn--primary" disabled={installing || providerWorking(provider)} onClick={onInstall}>
            {installing ? "Installing…" : "Install"}
          </button>
        )}
      </div>

      {provider.installed ? (
        <div className="integration-account-list">
          {provider.accounts.map((account, index) => {
            const isConnected = account.status === "connected";
            return (
              <ProviderAccountRow
                key={account.accountId}
                provider={provider}
                account={account}
                index={index}
                busy={busyKey === accountKey(provider.id, account.accountId)}
                selected={isConnected && account.accountId === defaultId}
                onSelect={() => setDefault(provider.runtimeId, account.accountId)}
                onCancel={() => onCancel(account.accountId)}
                onConnect={() => onConnect(account.accountId)}
                onDisconnect={() => onDisconnect(account.accountId)}
                onRemove={() => onRemove(account.accountId)}
                onOpenSignInPage={() => onOpenSignInPage(account.accountId)}
                onSubmit={(value) => onSubmit(account.accountId, value)}
              />
            );
          })}
          {!provider.canAddAccount ? (
            <p className="integration-install-hint">This is the most {provider.product} accounts Vibyra holds at once.</p>
          ) : null}
        </div>
      ) : (
        <div className="integration-account__foot">
          <p className="integration-install-hint">Runs <code>npm install -g {provider.package}</code></p>
        </div>
      )}
    </article>
  );
}
