import { useEffect, useMemo } from "react";

import { agentV2Available, selectAgentV2Account, type AgentV2Selection } from "../ipc/agentV2";
import type { CompanyGroup } from "./openRouterCatalog";
import type { ProviderIntegration } from "../providerTypes";
import { useModelCatalogStore } from "../state/modelCatalogStore";
import { useProviderAccountStore } from "../state/providerAccountStore";
import { useProviderDefaultStore } from "../state/providerDefaultStore";
import { resolvedModelEffort } from "./modelEffort";
import { nativeAccountModelSupported } from "./nativeAccountModels";
import { connectedAccounts, launchAccountId } from "./providerAccountPolicy";

// Runtime ids already match the runner's provider ids. Claude Code first:
// it is the only provider the runner can execute today.
const PROVIDERS = ["claude", "codex", "gemini"] as const;
const COMPANY: Record<AgentV2Selection["provider"], string> = { claude: "Anthropic", codex: "OpenAI", gemini: "Google" };
const EFFORTS = new Set(["minimal", "low", "medium", "high", "xhigh", "max"]);
const ACCOUNT = /^[A-Za-z0-9._-]{1,128}$/;
const MODEL = /^[A-Za-z0-9._:[\]/-]{1,120}$/;

/**
 * The account chosen in Settings → AI accounts (the provider default, else the
 * first signed-in one — exactly what a terminal launch uses), with that
 * provider's default model and effort from the model catalogue.
 */
function agentV2Selection(
  providers: ProviderIntegration[],
  defaults: Record<string, string>,
  groups: CompanyGroup[],
): AgentV2Selection | null {
  for (const provider of PROVIDERS) {
    const integration = providers.find((p) => p.runtimeId === provider);
    const account = launchAccountId(integration ? connectedAccounts(integration) : [], undefined, defaults[provider]);
    if (!integration || !connectedAccounts(integration).length || !account || !ACCOUNT.test(account)) continue;
    const model = groups.find((g) => g.company === COMPANY[provider])?.models
      .find((m) => nativeAccountModelSupported(m.company, m.id));
    if (!model) continue;
    const bare = model.id.replace(/^[^/]+\//, "");
    const id = provider === "claude" ? bare.replace(/\./g, "-") : bare;
    if (!MODEL.test(id)) continue;
    const effort = resolvedModelEffort(model, provider, "medium");
    return { provider, account, model: id, effort: effort && EFFORTS.has(effort) ? effort : null };
  }
  return null;
}

/** Keeps the Agent V2 Mac runner on the Settings account. Mounted once. */
export function useAgentV2Selection(): void {
  const providers = useProviderAccountStore((s) => s.providers);
  const loaded = useProviderAccountStore((s) => s.loaded);
  const defaults = useProviderDefaultStore((s) => s.byRuntime);
  const groups = useModelCatalogStore((s) => s.groups);
  const selection = useMemo(
    () => (loaded ? agentV2Selection(providers, defaults, groups) : null),
    [loaded, providers, defaults, groups],
  );
  const key = selection ? JSON.stringify(selection) : "";
  useEffect(() => {
    if (!selection || !agentV2Available()) return;
    selectAgentV2Account(selection).catch((error) => {
      console.warn("Agent runner account was not updated:", error);
    });
    // `key` is the selection's value; the object identity changes every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}
