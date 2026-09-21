import { useEffect, useRef } from "react";

import { useProviderAccountStore } from "../../state/providerAccountStore";
import { providerAccountRuntimeUpdate, providerWorking } from "../../lib/providerAccountPolicy";
import type { Settings } from "../../types";
import { ProviderIntegrationCard } from "./ProviderIntegrationCard";
import { SettingsBlock } from "./SettingsShared";
import { TerminalIntegrations, useOptionalRuntimes } from "./TerminalIntegrations";
import { IntegrationsBlock } from "./IntegrationsBlock";

interface Props {
  settings: Settings;
  update: (partial: Partial<Settings>) => Promise<void>;
}

/**
 * AI accounts: the company accounts terminal agents sign in with, then the
 * integrations (GitHub, Obsidian) chats and agents can reach. Accounts
 * authorize through each provider's own CLI; GitHub through the backend's
 * OAuth broker; the vault is a folder on this Mac. The OpenAI key for chat and
 * voice lives under Advanced.
 */
export function SettingsIntegrationsPane({ settings, update }: Props) {
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
  const otherRuntimes = useOptionalRuntimes("installed");

  useEffect(() => {
    void refreshAccounts();
  }, [refreshAccounts]);

  // A sign-in and an install both run as child processes whose progress only
  // the native side sees — including the moment a CLI stops and asks a
  // question, which is what the reply box is waiting for.
  useEffect(() => {
    if (!providers.some(providerWorking)) return;
    const timer = window.setInterval(() => void refreshAccounts(), 1_800);
    return () => window.clearInterval(timer);
  }, [providers, refreshAccounts]);

  // Two rows signed in to the same identity are one account listed twice.
  // The later one is an extra folder Vibyra created, so it is removed rather
  // than shown; each id is tried once so a failed removal cannot loop.
  const dedupeTried = useRef(new Set<string>());
  useEffect(() => {
    if (!loaded || busyKey) return;
    for (const provider of providers) {
      const seen = new Set<string>();
      for (const account of provider.accounts) {
        if (account.status !== "connected") continue;
        const label = account.accountLabel.trim().toLowerCase();
        if (!label) continue;
        const key = `${provider.id}:${account.accountId}`;
        if (seen.has(label) && account.removable && !dedupeTried.current.has(key)) {
          dedupeTried.current.add(key);
          void removeAccount(provider.id, account.accountId);
          return;
        }
        seen.add(label);
      }
    }
  }, [providers, loaded, busyKey, removeAccount]);

  useEffect(() => {
    const enabledAgentIds = providerAccountRuntimeUpdate(settings.enabledAgentIds, providers, loaded, error);
    if (enabledAgentIds) void update({ enabledAgentIds });
  }, [providers, error, loaded, settings.enabledAgentIds, update]);

  return (
    <section className="settings-integrations">
      <SettingsBlock
        label="Terminal accounts"
        panel="terminalAccounts"
        note="Sign in with the accounts your terminal agents use. Authorization stays in each provider’s own app."
      >
        <div className="settings-group integration-list">
          {!loaded ? <p className="integration-loading">Checking connected accounts…</p> : null}
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

      {otherRuntimes.length > 0 && (
        <SettingsBlock label="Other" note="Command-line tools already on this Mac. Switch one on to launch it from Vibyra.">
          <div className="settings-group">
            <TerminalIntegrations settings={settings} update={update} mode="installed" />
          </div>
        </SettingsBlock>
      )}

      <IntegrationsBlock />
    </section>
  );
}
