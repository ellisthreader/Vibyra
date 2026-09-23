import type { WorkspaceActions } from '../ui/types';
import type { WorkspaceStore } from '../state/WorkspaceStore';
import { keepSession, rememberAccount } from './accountActions';
import type { TwoFactorApi } from './twoFactorApi';

export type TwoFactorActionName =
  | 'loadTwoFactor'
  | 'startTwoFactor'
  | 'confirmTwoFactor'
  | 'newRecoveryCodes'
  | 'disableTwoFactor'
  | 'submitTwoFactorCode';

/** A code as the server will read it: digits only, or a recovery code as it was given. */
const tidy = (code: string) => {
  const clean = code.trim();
  return /^[\d\s-]+$/.test(clean) ? clean.replace(/\D+/g, '') : clean.toLowerCase();
};
const asked = 'Enter the six-digit code from your authenticator app.';

/**
 * Turning the second factor on and off, and answering for it at login.
 *
 * Every answer that carries the account replaces the one on screen and the one saved,
 * so Settings shows "On" the moment it is on, without asking the server again. The
 * code itself is never kept: it is good for thirty seconds and holding it longer than
 * the request that spends it would only be somewhere else for it to leak from.
 */
export function makeTwoFactorActions(
  store: WorkspaceStore,
): Pick<WorkspaceActions, TwoFactorActionName> {
  const signedIn = () => {
    if (!store.token) throw new Error('Sign in to manage your account.');
    return store.token;
  };
  const api = <K extends keyof TwoFactorApi>(name: K): TwoFactorApi[K] => {
    const call = store.deps.account[name];
    if (!call) throw new Error('Two-factor authentication isn’t available on this phone yet.');
    return call as TwoFactorApi[K];
  };
  const withCode = async (code: string, work: (token: string, code: string) => Promise<void>) => {
    const clean = tidy(code);
    if (!clean) throw new Error(asked);
    await work(signedIn(), clean);
  };
  return {
    loadTwoFactor: async () => api('twoFactorState')(signedIn()),
    startTwoFactor: async () => api('startTwoFactor')(signedIn()),
    confirmTwoFactor: async (code) => {
      const clean = tidy(code);
      if (clean.length !== 6) throw new Error(asked);
      const token = signedIn();
      const { recoveryCodes, user } = await api('confirmTwoFactor')(token, clean);
      if (store.token === token) await rememberAccount(store, user);
      return recoveryCodes;
    },
    newRecoveryCodes: async (code) => {
      const clean = tidy(code);
      if (!clean) throw new Error(asked);
      return api('newRecoveryCodes')(signedIn(), clean);
    },
    disableTwoFactor: async (code) =>
      withCode(code, async (token, clean) => {
        const user = await api('disableTwoFactor')(token, clean);
        if (store.token === token) await rememberAccount(store, user);
      }),
    // The password is already spent by this point, so this is the whole login: the
    // session it returns is kept exactly as one from a password alone would be.
    submitTwoFactorCode: async (challengeId, code) => {
      const clean = tidy(code);
      if (!clean) throw new Error(asked);
      await keepSession(store, await api('loginTwoFactor')(challengeId, clean));
    },
  };
}
