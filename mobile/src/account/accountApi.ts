import type { Account } from '../ui/types';

export interface AccountSession { token: string; user: Account }
export type AccountProvider = 'apple' | 'google';
export interface ProviderApi {
  appleChallenge(signal?: AbortSignal): Promise<{ challengeId: string; nonce: string }>;
  providerToken(identityToken: string, challengeId: string, name: string, signal?: AbortSignal): Promise<AccountSession>;
  startProvider(provider: AccountProvider, signal?: AbortSignal): Promise<{ flowId: string; authUrl: string }>;
  pollProvider(provider: AccountProvider, flowId: string, signal?: AbortSignal): Promise<AccountSession | null>;
}
export interface AccountApi {
  socialLogin?(provider: AccountProvider, signal: AbortSignal): Promise<AccountSession | null>;
  signup(email: string, password: string): Promise<AccountSession>;
  login(email: string, password: string): Promise<AccountSession>;
  session(token: string): Promise<Account>;
  logout(token: string): Promise<void>;
  // The phone cannot install anything on a computer, so it asks the backend to
  // email a download link. Signed in, the backend uses the account's own address
  // and ignores anything sent here; a guest supplies one.
  sendHostLink(token: string | null, email?: string): Promise<string>;
}
export class AccountError extends Error {
  constructor(message: string, readonly status: number) { super(message); this.name = 'AccountError'; }
}
export const unreachable = 'Vibyra could not be reached. Check your connection and try again.';
type Fetch = typeof fetch;

export function createAccountApi({ baseUrl, deviceName, fetch: fetchImpl = fetch }: {
  baseUrl: string; deviceName: string; fetch?: Fetch;
}): AccountApi & ProviderApi {
  const root = baseUrl.replace(/\/+$/, '');
  const call = async (method: string, path: string, body?: object, token?: string, signal?: AbortSignal): Promise<Record<string, unknown>> => {
    let response: Response;
    const controller = new AbortController();
    const abort = () => controller.abort();
    const timeout = setTimeout(abort, 20000);
    signal?.addEventListener('abort', abort);
    if (signal?.aborted) abort();
    let payload: Record<string, unknown> | null;
    try {
      response = await fetchImpl(`${root}${path}`, { method, headers: {
        Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      }, body: body ? JSON.stringify(body) : undefined, signal: controller.signal });
      payload = await response.json().catch(() => null) as Record<string, unknown> | null;
    } catch { throw new AccountError(unreachable, 0); }
    finally { clearTimeout(timeout); signal?.removeEventListener('abort', abort); }
    if (!response.ok || !payload || payload.ok !== true) {
      // The backend's own message reaches the user verbatim, e.g. "An account already exists for that email. Log in instead."
      const message = typeof payload?.error === 'string' && payload.error ? payload.error
        : response.status >= 500 ? 'Vibyra is having trouble right now. Try again in a moment.' : unreachable;
      throw new AccountError(message, response.status);
    }
    return payload;
  };
  const user = (value: unknown): Account => {
    const raw = value as Record<string, unknown> | null;
    if (!raw || typeof raw.email !== 'string') throw new AccountError('Vibyra returned an unexpected account. Try again.', 0);
    return { email: raw.email, name: typeof raw.name === 'string' ? raw.name : '', plan: typeof raw.plan === 'string' ? raw.plan : 'free' };
  };
  const session = (payload: Record<string, unknown>): AccountSession => {
    if (typeof payload.token !== 'string' || !payload.token) throw new AccountError('Vibyra returned an unexpected session. Try again.', 0);
    return { token: payload.token, user: user(payload.user) };
  };
  return {
    appleChallenge: async signal => {
      const data = await call('POST', '/api/auth/provider/challenge', { provider: 'apple' }, undefined, signal);
      if (typeof data.challengeId !== 'string' || !data.challengeId || typeof data.nonce !== 'string' || !data.nonce)
        throw new AccountError('Apple sign-in could not start. Please try again.', 0);
      return { challengeId: data.challengeId, nonce: data.nonce };
    },
    providerToken: async (identityToken, challengeId, name, signal) => session(await call('POST', '/api/auth/login',
      { provider: 'apple', identityToken, challengeId, name, deviceName }, undefined, signal)),
    startProvider: async (provider, signal) => {
      const data = await call('POST', `/api/auth/desktop/${provider}/start`, { deviceName }, undefined, signal);
      if (typeof data.flowId !== 'string' || !data.flowId || typeof data.authUrl !== 'string')
        throw new AccountError('Sign-in could not start. Please try again.', 0);
      const url = new URL(data.authUrl);
      const host = provider === 'google' ? 'accounts.google.com' : 'appleid.apple.com';
      if (url.protocol !== 'https:' || url.hostname !== host || url.username || url.password || url.port)
        throw new AccountError('Vibyra returned an unexpected sign-in address.', 0);
      return { flowId: data.flowId, authUrl: data.authUrl };
    },
    pollProvider: async (provider, flowId, signal) => {
      const data = await call('GET', `/api/auth/desktop/${provider}/status/${encodeURIComponent(flowId)}`, undefined, undefined, signal);
      if (data.status === 'pending') return null;
      if (data.status !== 'complete') throw new AccountError('Sign-in could not complete. Please try again.', 0);
      return session(data);
    },
    signup: async (email, password) => session(await call('POST', '/api/auth/signup', { email, password, deviceName })),
    login: async (email, password) => session(await call('POST', '/api/auth/login', { provider: 'email', email, password, deviceName })),
    session: async token => user((await call('GET', '/api/session', undefined, token)).user),
    logout: async token => { await call('DELETE', '/api/auth/logout', undefined, token); },
    sendHostLink: async (token, email) =>
      String((await call('POST', '/api/account/host-link', email ? { email } : {}, token ?? undefined)).email ?? ''),
  };
}
