import type { ProviderAccount, ProviderIntegration } from "../providerTypes";

const ACCOUNT_RUNTIME_IDS = ["codex", "claude", "gemini"] as const;

const ACCOUNT_RUNTIME_SET = new Set<string>(ACCOUNT_RUNTIME_IDS);
const PROVIDER_KEYS: Record<string, string> = {
  codex: "openai",
  claude: "anthropic",
  gemini: "google",
};

export function providerIconKey(provider: ProviderIntegration): string {
  return PROVIDER_KEYS[provider.id] ?? provider.id;
}

/** Statuses on the way somewhere. None of them should drop a selection. */
const TRANSIENT = new Set(["connecting", "installing", "error"]);

export function providerStatusLabel(account: ProviderAccount): string {
  if (account.status === "connected") return "Connected";
  if (account.status === "connecting") return "Authorizing";
  if (account.status === "installing") return "Installing";
  if (account.status === "not-installed") return "Not installed";
  if (account.status === "error") return "Try again";
  return "Not connected";
}

/** True while a row is waiting on a child process the user already started. */
export function accountWorking(account: ProviderAccount): boolean {
  return account.status === "connecting" || account.status === "installing";
}

/** True while any account under this provider is mid-flight. */
export function providerWorking(provider: ProviderIntegration): boolean {
  return provider.accounts.some(accountWorking);
}

/**
 * A provider counts as usable when **any** of its accounts is signed in —
 * having two ChatGPT logins and being signed out of one is still being signed
 * in to ChatGPT.
 */
function providerConnected(provider: ProviderIntegration): boolean {
  return provider.accounts.some((account) => account.status === "connected");
}

/** The id the settings map uses for the login every install already had. */
export const DEFAULT_ACCOUNT = "default";

/**
 * Panes address the first account as `null`, because it is the absence of a
 * redirect rather than a place; the settings map has to name it to store it.
 */
export function paneAccountId(accountId: string): string | null {
  return accountId === DEFAULT_ACCOUNT ? null : accountId;
}

/** Which account this company's terminals currently run as. */
export function activeAccountId(
  accounts: Record<string, string> | undefined,
  providerId: string,
): string {
  return accounts?.[providerId] ?? DEFAULT_ACCOUNT;
}

/** The accounts a launcher may run as. */
export function connectedAccounts(provider: ProviderIntegration): ProviderAccount[] {
  return provider.accounts.filter((account) => account.status === "connected");
}

export function enabledRuntimesForAccounts(
  current: string[],
  providers: ProviderIntegration[],
): string[] {
  const byRuntime = new Map(providers.map((provider) => [provider.runtimeId, provider]));
  const next = current.filter((id) => {
    if (!ACCOUNT_RUNTIME_SET.has(id)) return true;
    const provider = byRuntime.get(id);
    if (!provider) return false;
    return providerConnected(provider) || providerWorking(provider) || hasError(provider);
  });
  for (const provider of providers) {
    if (providerConnected(provider) && !next.includes(provider.runtimeId)) {
      next.push(provider.runtimeId);
    }
  }
  return next;
}

function hasError(provider: ProviderIntegration): boolean {
  return provider.accounts.some((account) => TRANSIENT.has(account.status));
}

export function providerAccountRuntimeUpdate(
  current: string[],
  providers: ProviderIntegration[],
  loaded: boolean,
  error: string,
): string[] | null {
  if (!loaded || error) return null;
  const next = enabledRuntimesForAccounts(current, providers);
  return next.join("\0") === current.join("\0") ? null : next;
}

export function isAccountRuntime(id: string): boolean {
  return ACCOUNT_RUNTIME_SET.has(id);
}
