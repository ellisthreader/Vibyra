import { connectedAccounts } from './providerAccountPolicy.ts';
import type { ProviderIntegration } from '../providerTypes';
import type { AccountModel } from './phoneAccountModels';
/** A saved default is not evidence of sign-in. A failed provider cannot hide another. */
export async function phoneModelAccounts(providers: ProviderIntegration[], resolve: (provider: string) => string | null,
  fetch: (provider: string, account: string) => Promise<{ data: AccountModel[] }>) {
  const entries = await Promise.all(['codex', 'claude', 'gemini'].map(async provider => {
    const identity = providers.find(item => item.runtimeId === provider);
    const account = resolve(provider);
    if (!identity || !account || !connectedAccounts(identity).some(item => item.accountId === account))
      return [provider, []] as const;
    try {
      const result = await fetch(provider, account);
      return [provider, resolve(provider) === account ? result.data : []] as const;
    } catch { return [provider, []] as const; }
  }));
  return Object.fromEntries(entries);
}
