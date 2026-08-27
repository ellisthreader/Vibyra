import { useEffect, useMemo } from "react";

import { useModelCatalogStore } from "../../state/modelCatalogStore";
import { useProviderAccountStore } from "../../state/providerAccountStore";
import {
  providerAccountRuntimeUpdate,
  providerWorking,
} from "../../lib/providerAccountPolicy";
import type { Settings } from "../../types";
import { ProviderMark } from "../common/AgentMark";
import { RestartIcon } from "../common/Icons";
import { SettingsBlock } from "./SettingsShared";
import { GithubIntegrationCard } from "./GithubIntegrationCard";
import { ProviderIntegrationCard } from "./ProviderIntegrationCard";
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
  const providers = useProviderAccountStore((state) => state.providers);
  const busyKey = useProviderAccountStore((state) => state.busyKey);
  const error = useProviderAccountStore((state) => state.error);
  const loaded = useProviderAccountStore((state) => state.loaded);
  const refreshAccounts = useProviderAccountStore((state) => state.refresh);
  const connect = useProviderAccountStore((state) => state.connect);
  const addAccount = useProviderAccountStore((state) => state.addAccount);
  const removeAccount = useProviderAccountStore((state) => state.removeAccount);
  const install = useProviderAccountStore((state) => state.install);
  const submit = useProviderAccountStore((state) => state.submit);
  const cancel = useProviderAccountStore((state) => state.cancel);
  const disconnect = useProviderAccountStore((state) => state.disconnect);
  const openSignInPage = useProviderAccountStore((state) => state.openSignInPage);
  const modelCount = useMemo(() => groups.reduce((sum, group) => sum + group.models.length, 0), [groups]);

  useEffect(() => {
    void refreshCatalog();
    void refreshAccounts();
  }, [refreshAccounts, refreshCatalog]);

  // A sign-in and an install both run as child processes whose progress only
  // the native side sees — including the moment a CLI stops and asks a
  // question, which is what the reply box is waiting for.
  useEffect(() => {
    if (!providers.some(providerWorking)) return;
    const timer = window.setInterval(() => void refreshAccounts(), 1_800);
    return () => window.clearInterval(timer);
  }, [providers, refreshAccounts]);

  useEffect(() => {
    const enabledAgentIds = providerAccountRuntimeUpdate(settings.enabledAgentIds, providers, loaded, error);
    if (enabledAgentIds) void update({ enabledAgentIds });
  }, [providers, error, loaded, settings.enabledAgentIds, update]);

  const catalogLabel = loading ? "Refreshing" : source === "live" ? "Live" : source === "cache" ? "Cached" : "Offline fallback";
  const catalogTone = loading ? "working" : source === "live" ? "success" : "neutral";

  return (
    <>
      <p className="settings-lead">
        Connect the accounts you already use for personal AI terminals — more than one per
        company if you have them. Authorization stays with the official provider app.
      </p>

      <SettingsBlock label="AI accounts">
        <div className="settings-group integration-list">
          {!loaded ? <p className="settings-loading">Checking connected accounts…</p> : null}
          {providers.map((provider) => (
            <ProviderIntegrationCard
              key={provider.id}
              provider={provider}
              busyKey={busyKey}
              onAddAccount={() => void addAccount(provider.id)}
              onInstall={() => void install(provider.id)}
              onConnect={(account) => void connect(provider.id, account)}
              onRemove={(account) => void removeAccount(provider.id, account)}
              onSubmit={(account, value) => void submit(provider.id, account, value)}
              onCancel={(account) => void cancel(provider.id, account)}
              onDisconnect={(account) => void disconnect(provider.id, account)}
              onOpenSignInPage={(account) => void openSignInPage(provider.id, account)}
            />
          ))}
        </div>
        {error ? <p className="integration-error" role="alert">{error}</p> : null}
      </SettingsBlock>

      <SettingsBlock label="Developer tools">
        <GithubIntegrationCard />
      </SettingsBlock>

      <SettingsBlock label="Model catalog">
        <article className="settings-group integration-card">
          <div className="integration-card__head">
            <ProviderMark provider="openrouter" label="OpenRouter" accent="#5b7cfa" size={40} />
            <div className="integration-card__identity">
              <div className="integration-card__title">
                <h3>OpenRouter</h3>
                <span className={`settings-status settings-status--${catalogTone}`}><i aria-hidden="true" />{catalogLabel}</span>
              </div>
              <p>{modelCount} models available in agent launchers</p>
            </div>
            <button type="button" className="integration-refresh" disabled={loading} onClick={() => void refreshCatalog(true)}>
              <RestartIcon size={13} />{loading ? "Refreshing" : "Refresh"}
            </button>
          </div>
          <p className="integration-card__note">Vibyra refreshes this public catalog automatically. It is not a connected billing account.</p>
        </article>
      </SettingsBlock>

      <TerminalIntegrations settings={settings} update={update} />
    </>
  );
}
