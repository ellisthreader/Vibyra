import type { ProviderAccount } from "../types";

const ACCOUNT_RUNTIME_IDS = ["codex", "claude", "gemini"] as const;

const ACCOUNT_RUNTIME_SET = new Set<string>(ACCOUNT_RUNTIME_IDS);
const PROVIDER_KEYS: Record<string, string> = {
  codex: "openai",
  claude: "anthropic",
  gemini: "google",
};

export function providerIconKey(account: ProviderAccount): string {
  return PROVIDER_KEYS[account.id] ?? account.id;
}

export function providerStatusLabel(account: ProviderAccount): string {
  if (account.status === "connected") return "Connected";
  if (account.status === "connecting") return "Authorizing";
  if (account.status === "not-installed") return "App required";
  if (account.status === "error") return "Try again";
  return "Not connected";
}

export function enabledRuntimesForAccounts(
  current: string[],
  accounts: ProviderAccount[],
): string[] {
  const byRuntime = new Map(accounts.map((account) => [account.runtimeId, account]));
  const next = current.filter((id) => {
    if (!ACCOUNT_RUNTIME_SET.has(id)) return true;
    const status = byRuntime.get(id)?.status;
    return status === "connecting" || status === "error";
  });
  for (const account of accounts) {
    if (account.status === "connected" && !next.includes(account.runtimeId)) {
      next.push(account.runtimeId);
    }
  }
  return next;
}

export function providerAccountRuntimeUpdate(
  current: string[],
  accounts: ProviderAccount[],
  loaded: boolean,
  error: string,
): string[] | null {
  if (!loaded || error) return null;
  const next = enabledRuntimesForAccounts(current, accounts);
  return next.join("\0") === current.join("\0") ? null : next;
}

export function isAccountRuntime(id: string): boolean {
  return ACCOUNT_RUNTIME_SET.has(id);
}
