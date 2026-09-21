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
  return browserFlow(() => api.startProvider(provider, signal), flowId => api.pollProvider(provider, flowId, signal),
    signal, browser, 'This sign-in attempt expired. Please try again.', pause, now);
}
/** The shape every browser round-trip shares: start, open, poll until it answers, the
 *  browser is closed, or ten minutes pass. Null means cancelled; the browser always closes. */
export async function browserFlow<T>(start: () => Promise<{ flowId: string; authUrl: string }>,
  poll: (flowId: string) => Promise<T | null>, signal: AbortSignal, browser: ProviderBrowser, expired: string,
  pause = () => new Promise<void>(resolve => setTimeout(resolve, 1500)), now = Date.now): Promise<T | null> {
  try {
    if (signal.aborted) return null;
    const flow = await start();
    if (signal.aborted || browser.closed()) return null;
    browser.open(flow.authUrl);
    const deadline = now() + 10 * 60 * 1000;
    while (!signal.aborted && !browser.closed() && now() < deadline) {
      const result = await poll(flow.flowId);
      if (signal.aborted) return null;
      if (result) return result;
      await pause();
    }
    if (!signal.aborted && !browser.closed()) throw new Error(expired);
    return null;
  } catch (error) { if (signal.aborted) return null; throw error; }
  finally { browser.close(); }
}
