import type { AccountProvider, AccountSession, ProviderApi } from './accountApi';

export interface ProviderBrowser {
  open(url: string): void;
  closed(): boolean;
  close(): void;
}
// The backend owns state, PKCE, code exchange and identity verification. The flow ID
// is a short-lived secret, kept only here; only the resulting session is persisted.
export async function browserProvider(api: ProviderApi, provider: AccountProvider, signal: AbortSignal,
  browser: ProviderBrowser, pause = () => new Promise<void>(resolve => setTimeout(resolve, 1500)),
  now = Date.now): Promise<AccountSession | null> {
  try {
    if (signal.aborted) return null;
    const flow = await api.startProvider(provider, signal);
    if (signal.aborted || browser.closed()) return null;
    browser.open(flow.authUrl);
    const deadline = now() + 10 * 60 * 1000;
    while (!signal.aborted && !browser.closed() && now() < deadline) {
      const session = await api.pollProvider(provider, flow.flowId, signal);
      if (signal.aborted) return null;
      if (session) return session;
      await pause();
    }
    if (!signal.aborted && !browser.closed()) throw new Error('This sign-in attempt expired. Please try again.');
    return null;
  } catch (error) { if (signal.aborted) return null; throw error; }
  finally { browser.close(); }
}
