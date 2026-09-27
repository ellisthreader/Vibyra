import type { Account, AccountDevice } from '../ui/types';
import { AccountError, parseAccount, unreachable, type AccountProvider } from './accountApi';

/**
 * The account's own settings: its name and email, its photo, where it is signed in,
 * password help, and deleting it. Every call carries the account's bearer except the
 * two emails, which the backend answers the same way for any address.
 */
export interface ProfileApi {
  updateProfile(token: string, changes: { name?: string; email?: string }): Promise<Account>;
  uploadAvatar(token: string, uri: string): Promise<Account>;
  removeAvatar(token: string): Promise<Account>;
  devices(token: string): Promise<AccountDevice[]>;
  /** `currentRevoked` is true when the device removed was this one. */
  revokeDevice(token: string, id: string): Promise<{ currentRevoked: boolean }>;
  /** Every session, this phone's included. */
  revokeAllSessions(token: string): Promise<void>;
  forgotPassword(email: string): Promise<string>;
  resendVerification(email: string): Promise<string>;
  deleteWithPassword(token: string, password: string): Promise<void>;
  deleteWithApple(token: string, challengeId: string, identityToken: string): Promise<void>;
  /** A GitHub-made account has no password and no identity token to present again: the session is the proof. */
  deleteSignedIn(token: string): Promise<void>;
  /** A browser sign-in whose only effect, once it completes, is deleting the account. */
  startDeletion(
    token: string,
    provider: AccountProvider,
  ): Promise<{ flowId: string; authUrl: string }>;
  deletionStatus(provider: AccountProvider, flowId: string): Promise<'pending' | 'deleted'>;
  /** A one-time Stripe billing portal address for a card subscription. */
  billingPortal(token: string): Promise<string>;
}
type Fetch = typeof fetch;
// Photos the phone has on disk go up as a file part; a browser's blob: or data: URL is
// read into a Blob first, because a browser FormData has no notion of a file path.
const onDisk = /^(file|content|ph|assets-library):/i;

export function createProfileApi({
  baseUrl,
  deviceName,
  fetch: fetchImpl = fetch,
  read = fetch,
}: {
  baseUrl: string;
  deviceName: string;
  fetch?: Fetch;
  read?: Fetch;
}): ProfileApi {
  const root = baseUrl.replace(/\/+$/, '');
  const call = async (
    method: string,
    path: string,
    { json, form, token }: { json?: object; form?: FormData; token?: string } = {},
  ) => {
    let response: Response;
    let payload: Record<string, unknown> | null;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), form ? 60000 : 20000);
    try {
      response = await fetchImpl(`${root}${path}`, {
        method,
        signal: controller.signal,
        body: form ?? (json ? JSON.stringify(json) : undefined),
        headers: {
          Accept: 'application/json',
          ...(json ? { 'Content-Type': 'application/json' } : {}),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
      payload = (await response.json().catch(() => null)) as Record<string, unknown> | null;
    } catch {
      throw new AccountError(unreachable, 0);
    } finally {
      clearTimeout(timeout);
    }
    if (!response.ok || !payload || payload.ok !== true) {
      const message =
        typeof payload?.error === 'string' && payload.error
          ? payload.error
          : response.status >= 500
            ? 'Vibyra is having trouble right now. Try again in a moment.'
            : response.status === 404 || response.status === 405
              ? 'This isn’t available yet. Try again after the next update.'
              : unreachable;
      throw new AccountError(message, response.status);
    }
    return payload;
  };
  const message = (payload: Record<string, unknown>, fallback: string) =>
    typeof payload.message === 'string' && payload.message ? payload.message : fallback;
  const device = (value: unknown): AccountDevice | null => {
    const raw = value as Record<string, unknown> | null;
    if (!raw || typeof raw.id !== 'string') return null;
    return {
      id: raw.id,
      name: typeof raw.deviceName === 'string' && raw.deviceName ? raw.deviceName : 'Vibyra device',
      location: typeof raw.location === 'string' ? raw.location : '',
      current: raw.current === true,
      lastActive: typeof raw.updatedAt === 'string' ? raw.updatedAt : null,
    };
  };
  return {
    updateProfile: async (token, changes) =>
      parseAccount((await call('POST', '/api/account/profile', { json: changes, token })).user),
    uploadAvatar: async (token, uri) => {
      const form = new FormData();
      if (onDisk.test(uri))
        form.append('photo', { uri, name: 'avatar.jpg', type: 'image/jpeg' } as unknown as Blob);
      else {
        let blob: Blob;
        try {
          blob = await (await read(uri)).blob();
        } catch {
          throw new AccountError('That photo could not be read. Choose another.', 0);
        }
        form.append('photo', blob, 'avatar.jpg');
      }
      return parseAccount((await call('POST', '/api/account/avatar', { form, token })).user);
    },
    removeAvatar: async (token) =>
      parseAccount((await call('DELETE', '/api/account/avatar', { token })).user),
    devices: async (token) => {
      const list = (await call('GET', '/api/account/sessions', { token })).devices;
      return Array.isArray(list)
        ? list.map(device).filter((item): item is AccountDevice => item !== null)
        : [];
    },
    revokeDevice: async (token, id) => ({
      currentRevoked:
        (await call('DELETE', `/api/account/devices/${encodeURIComponent(id)}`, { token }))
          .currentRevoked === true,
    }),
    revokeAllSessions: async (token) => {
      await call('DELETE', '/api/account/sessions', { token });
    },
    forgotPassword: async (email) =>
      message(
        await call('POST', '/api/auth/password/forgot', { json: { email } }),
        'If that email belongs to a Vibyra password account, a reset link has been sent.',
      ),
    resendVerification: async (email) =>
      message(
        await call('POST', '/api/auth/email/resend', { json: { email } }),
        'If that email still needs verification, a new link has been sent.',
      ),
    deleteWithPassword: async (token, password) => {
      await call('DELETE', '/api/account', { json: { password }, token });
    },
    deleteSignedIn: async (token) => {
      await call('DELETE', '/api/account', { token });
    },
    deleteWithApple: async (token, challengeId, identityToken) => {
      await call('DELETE', '/api/account', { json: { challengeId, identityToken }, token });
    },
    startDeletion: async (token, provider) => {
      const data = await call('POST', `/api/auth/desktop/${provider}/start`, {
        json: { deviceName, purpose: 'deletion' },
        token,
      });
      if (typeof data.flowId !== 'string' || !data.flowId || typeof data.authUrl !== 'string')
        throw new AccountError('Deletion could not start. Please try again.', 0);
      const url = new URL(data.authUrl);
      const host = provider === 'google' ? 'accounts.google.com' : 'appleid.apple.com';
      if (
        url.protocol !== 'https:' ||
        url.hostname !== host ||
        url.username ||
        url.password ||
        url.port
      )
        throw new AccountError('Vibyra returned an unexpected sign-in address.', 0);
      return { flowId: data.flowId, authUrl: data.authUrl };
    },
    deletionStatus: async (provider, flowId) => {
      const data = await call(
        'GET',
        `/api/auth/desktop/${provider}/status/${encodeURIComponent(flowId)}`,
      );
      if (data.status === 'pending') return 'pending';
      if (data.status === 'complete' && data.deleted === true) return 'deleted';
      throw new AccountError('Your account could not be deleted. Please try again.', 0);
    },
    billingPortal: async (token) => {
      const data = await call('POST', '/api/billing/portal', { token, json: {} });
      if (typeof data.url !== 'string' || !data.url.startsWith('https://'))
        throw new AccountError('Billing couldn’t be opened. Please try again.', 0);
      return data.url;
    },
  };
}
