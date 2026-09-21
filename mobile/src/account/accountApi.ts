import type { Account } from '../ui/types';
import { createProfileApi, type ProfileApi } from './profileApi';
import { createTwoFactorApi, twoFactorPrompt, type TwoFactorApi, type TwoFactorPrompt } from './twoFactorApi';

export interface AccountSession { token: string; user: Account }
/** A login either signs in or asks for a code; a wrong password is neither, and throws. */
export type LoginResult = AccountSession | { twoFactor: TwoFactorPrompt };
export const needsCode = (result: LoginResult): result is { twoFactor: TwoFactorPrompt } => 'twoFactor' in result;
export type AccountProvider = 'apple' | 'google';
export interface ProviderApi {
  appleChallenge(signal?: AbortSignal): Promise<{ challengeId: string; nonce: string }>;
  providerToken(identityToken: string, challengeId: string, name: string, signal?: AbortSignal): Promise<AccountSession>;
  startProvider(provider: AccountProvider, signal?: AbortSignal): Promise<{ flowId: string; authUrl: string }>;
  pollProvider(provider: AccountProvider, flowId: string, signal?: AbortSignal): Promise<AccountSession | null>;
}
// The profile calls are optional so a stand-in account (tests, the sample) needs none of them.
export interface AccountApi extends Partial<ProfileApi>, Partial<TwoFactorApi> {
  socialLogin?(provider: AccountProvider, signal: AbortSignal): Promise<AccountSession | null>;
  /** Deletes a provider account by signing in with that provider again. False when cancelled. */
  providerDeletion?(provider: AccountProvider, token: string, signal: AbortSignal): Promise<boolean>;
  signup(email: string, password: string, guestToken?: string): Promise<AccountSession>;
  login(email: string, password: string): Promise<LoginResult>;
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
// `github`: made by connecting GitHub while signed out (src/integrations).
const providers = ['email', 'apple', 'google', 'github'] as const;
/** The account as the phone keeps it. Fields an older server leaves out stay absent, not undefined. */
export function parseAccount(value: unknown): Account {
  const raw = value as Record<string, unknown> | null;
  if (!raw || typeof raw.email !== 'string') throw new AccountError('Vibyra returned an unexpected account. Try again.', 0);
  const provider = providers.find(item => item === raw.provider);
  return { email: raw.email, name: typeof raw.name === 'string' ? raw.name : '', plan: typeof raw.plan === 'string' ? raw.plan : 'free',
    ...('avatarUrl' in raw ? { avatarUrl: typeof raw.avatarUrl === 'string' && raw.avatarUrl ? raw.avatarUrl : null } : {}),
    ...(provider ? { provider } : {}), ...(typeof raw.emailVerified === 'boolean' ? { emailVerified: raw.emailVerified } : {}),
    ...(typeof raw.twoFactorEnabled === 'boolean' ? { twoFactorEnabled: raw.twoFactorEnabled } : {}),
    ...billing(raw) };
}
const text = (value: unknown) => (typeof value === 'string' && value ? value : null);
/** How the plan is billed and when the account began, each only when the server says so. */
function billing(raw: Record<string, unknown>): Partial<Account> {
  const cycle = raw.planBillingCycle === 'annual' || raw.planBillingCycle === 'monthly' ? raw.planBillingCycle : null;
  return { ...(text(raw.createdAt) ? { createdAt: text(raw.createdAt)! } : {}), ...(cycle ? { planBillingCycle: cycle } : {}),
    ...('planRenewsAt' in raw ? { planRenewsAt: text(raw.planRenewsAt) } : {}),
    ...('membershipEndsAt' in raw ? { membershipEndsAt: text(raw.membershipEndsAt) } : {}),
    ...(typeof raw.membershipCancelAtPeriodEnd === 'boolean' ? { membershipCancelAtPeriodEnd: raw.membershipCancelAtPeriodEnd } : {}),
    ...('billingProvider' in raw ? { billingProvider: text(raw.billingProvider) } : {}),
    ...(typeof raw.canManageStripeBilling === 'boolean' ? { canManageStripeBilling: raw.canManageStripeBilling } : {}) };
}

export function createAccountApi({ baseUrl, deviceName, fetch: fetchImpl = fetch }: {
  baseUrl: string; deviceName: string; fetch?: Fetch;
}): AccountApi & ProviderApi & ProfileApi & TwoFactorApi {
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
  const user = parseAccount;
  const session = (payload: Record<string, unknown>): AccountSession => {
    if (typeof payload.token !== 'string' || !payload.token) throw new AccountError('Vibyra returned an unexpected session. Try again.', 0);
    return { token: payload.token, user: user(payload.user) };
  };
  return {
    ...createProfileApi({ baseUrl: root, deviceName, fetch: fetchImpl }),
    ...createTwoFactorApi(call, deviceName),
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
    signup: async (email, password, guestToken) => {
      const attempt = () => call('POST', '/api/auth/signup', { email, password, deviceName }, guestToken);
      try { return session(await attempt()); } catch (error) {
        // A gateway that gave up says nothing about what the backend did with the
        // request, so the account may well be there already. Asking a second time
        // is what a person would do, and it is safe: the backend refuses a second
        // account for the same address. When that refusal is what comes back --
        // 409 for the address, 403 for the guest the lost attempt converted -- the
        // account is theirs, made by the answer that never arrived, and the very
        // credentials just typed sign them in rather than stranding them on an
        // error about an account they have.
        if (!(error instanceof AccountError) || error.status < 500) throw error;
        await new Promise(resolve => setTimeout(resolve, 800));
        try { return session(await attempt()); } catch (again) {
          if (!(again instanceof AccountError) || (again.status !== 409 && again.status !== 403)) throw again;
          try {
            const answer = await call('POST', '/api/auth/login', { provider: 'email', email, password, deviceName });
            // An account that asks for a code cannot be signed in from inside a sign-up,
            // so this says what it always said: the account is already there, log in.
            if (twoFactorPrompt(answer)) throw again;
            return session(answer);
          } catch { throw again; }
        }
      }
    },
    login: async (email, password) => {
      const answer = await call('POST', '/api/auth/login', { provider: 'email', email, password, deviceName });
      const asked = twoFactorPrompt(answer);
      return asked ? { twoFactor: asked } : session(answer);
    },
    session: async token => user((await call('GET', '/api/session', undefined, token)).user),
    logout: async token => { await call('DELETE', '/api/auth/logout', undefined, token); },
    sendHostLink: async (token, email) =>
      String((await call('POST', '/api/account/host-link', email ? { email } : {}, token ?? undefined)).email ?? ''),
  };
}
