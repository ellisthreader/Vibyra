import { useEffect, useMemo } from "react";

import { useModelCatalogStore } from "../../state/modelCatalogStore";
import { useProviderAccountStore } from "../../state/providerAccountStore";
import { providerAccountRuntimeUpdate } from "../../lib/providerAccountPolicy";
import type { Settings } from "../../types";
import { ProviderMark } from "../common/AgentMark";
import { RestartIcon } from "../common/Icons";
import { ProviderAccountRow } from "./ProviderAccountRow";
import { TerminalIntegrations } from "./TerminalIntegrations";

interface Props {
  settings: Settings;
  update: (partial: Partial<Settings>) => Promise<void>;
}

export function SettingsIntegrationsPane({ settings, update }: Props) {
  const groups = useModelCatalogStore((state) => state.groups);
  const loading = useModelCatalogStore((state) => state.loading);
  const source = useModelCatalogStore((state) => state.source);
  const refreshCatalog = useModelCatalogStore((state) => state.refresh);
  const accounts = useProviderAccountStore((state) => state.accounts);
  const busyId = useProviderAccountStore((state) => state.busyId);
  const error = useProviderAccountStore((state) => state.error);
  const loaded = useProviderAccountStore((state) => state.loaded);
  const refreshAccounts = useProviderAccountStore((state) => state.refresh);
  const connect = useProviderAccountStore((state) => state.connect);
  const cancel = useProviderAccountStore((state) => state.cancel);
  const disconnect = useProviderAccountStore((state) => state.disconnect);
  const openSignInPage = useProviderAccountStore((state) => state.openSignInPage);
  const modelCount = useMemo(() => groups.reduce((sum, group) => sum + group.models.length, 0), [groups]);

  useEffect(() => {
    void refreshCatalog();
    void refreshAccounts();
  }, [refreshAccounts, refreshCatalog]);

  useEffect(() => {
    if (!accounts.some((account) => account.status === "connecting")) return;
    const timer = window.setInterval(() => void refreshAccounts(), 1_800);
    return () => window.clearInterval(timer);
  }, [accounts, refreshAccounts]);

  useEffect(() => {
    const enabledAgentIds = providerAccountRuntimeUpdate(settings.enabledAgentIds, accounts, loaded, error);
    if (enabledAgentIds) void update({ enabledAgentIds });
  }, [accounts, error, loaded, settings.enabledAgentIds, update]);

  const catalogLabel = loading ? "Refreshing" : source === "live" ? "Live" : source === "cache" ? "Cached" : "Offline fallback";
  const catalogTone = loading ? "working" : source === "live" ? "success" : "neutral";

  return (
    <section className="settings-integrations" aria-labelledby="integration-list-label">
      <span className="section-label" id="integration-list-label">AI accounts</span>
      <p className="integrations-intro">Connect the account you already use for personal AI terminals. Authorization stays with the official provider app.</p>
      <div className="integration-list">
        {!loaded ? <p className="integration-loading">Checking connected accounts…</p> : null}
        {accounts.map((account) => (
          <ProviderAccountRow
            key={account.id}
            account={account}
            busy={busyId === account.id}
            onConnect={() => void connect(account.id)}
            onCancel={() => void cancel(account.id)}
            onDisconnect={() => void disconnect(account.id)}
            onOpenSignInPage={() => void openSignInPage(account.id)}
          />
        ))}
      </div>
      {error ? <p className="integration-error" role="alert">{error}</p> : null}

      <span className="section-label">Model catalog</span>
      <article className="integration-card integration-catalog">
        <div className="integration-card__head">
          <ProviderMark provider="openrouter" label="OpenRouter" accent="#5b7cfa" size={40} />
          <div className="integration-card__identity">
            <div className="integration-card__title"><h3>OpenRouter</h3><span className={`integration-status integration-status--${catalogTone}`}><i aria-hidden="true" />{catalogLabel}</span></div>
            <p>{modelCount} models available in agent launchers</p>
          </div>
          <button type="button" className="integration-refresh" disabled={loading} onClick={() => void refreshCatalog(true)}>
            <RestartIcon size={13} />{loading ? "Refreshing" : "Refresh"}
          </button>
        </div>
        <p className="integration-card__note">Vibyra refreshes this public catalog automatically. It is not a connected billing account.</p>
      </article>
      <TerminalIntegrations settings={settings} update={update} />
    </section>
  );
}
