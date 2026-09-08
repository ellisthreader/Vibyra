import type { Account } from '../ui/types';

export interface AccountSession { token: string; user: Account }
export interface AccountApi {
  signup(email: string, password: string): Promise<AccountSession>;
  login(email: string, password: string): Promise<AccountSession>;
  session(token: string): Promise<Account>;
  logout(token: string): Promise<void>;
}
export class AccountError extends Error {
  constructor(message: string, readonly status: number) { super(message); this.name = 'AccountError'; }
}
export const unreachable = 'Vibyra could not be reached. Check your connection and try again.';
type Fetch = typeof fetch;

export function createAccountApi({ baseUrl, deviceName, fetch: fetchImpl = fetch }: {
  baseUrl: string; deviceName: string; fetch?: Fetch;
}): AccountApi {
  const root = baseUrl.replace(/\/+$/, '');
  const call = async (method: string, path: string, body?: object, token?: string): Promise<Record<string, unknown>> => {
    let response: Response;
    try {
      response = await fetchImpl(`${root}${path}`, { method, headers: {
        Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      }, body: body ? JSON.stringify(body) : undefined });
    } catch { throw new AccountError(unreachable, 0); }
    const payload = await response.json().catch(() => null) as Record<string, unknown> | null;
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
    signup: async (email, password) => session(await call('POST', '/api/auth/signup', { email, password, deviceName })),
    login: async (email, password) => session(await call('POST', '/api/auth/login', { provider: 'email', email, password, deviceName })),
    session: async token => user((await call('GET', '/api/session', undefined, token)).user),
    logout: async token => { await call('DELETE', '/api/auth/logout', undefined, token); },
  };
}
