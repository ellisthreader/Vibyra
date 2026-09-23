import type { Account } from '../ui/types';
import { AccountError, parseAccount, type AccountSession } from './accountApi';

/**
 * The second factor, as the phone talks to it. The secret leaves the server exactly
 * once — when a setup starts — and is never asked for again; everything after that is
 * a six-digit code, or one of the recovery codes, which the server spends on use.
 */
export interface TwoFactorSetup {
  /** The base32 secret, shown so it can be typed into an app that cannot scan. */
  secret: string;
  /** The `otpauth://` link: the QR code's contents, and what an app is opened with. */
  uri: string;
  account: string;
}
export interface TwoFactorState {
  enabled: boolean;
  /** False for an Apple or Google account, whose second step belongs to the provider. */
  available: boolean;
  confirmedAt: string | null;
  recoveryCodesLeft: number;
}
/** A login the password got halfway through. */
export interface TwoFactorPrompt {
  challengeId: string;
  expiresIn: number;
}

export interface TwoFactorApi {
  twoFactorState(token: string): Promise<TwoFactorState>;
  startTwoFactor(token: string): Promise<TwoFactorSetup>;
  /** The first code from the app. Its answer is the only sight of the recovery codes. */
  confirmTwoFactor(
    token: string,
    code: string,
  ): Promise<{ recoveryCodes: string[]; user: Account }>;
  newRecoveryCodes(token: string, code: string): Promise<string[]>;
  disableTwoFactor(token: string, code: string): Promise<Account>;
  loginTwoFactor(challengeId: string, code: string): Promise<AccountSession>;
}
type Call = (
  method: string,
  path: string,
  body?: object,
  token?: string,
) => Promise<Record<string, unknown>>;

const text = (value: unknown, whose: string): string => {
  if (typeof value !== 'string' || !value)
    throw new AccountError(`Vibyra returned an unexpected ${whose}. Try again.`, 0);
  return value;
};
const codes = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.length > 0)
    : [];

/** Reads a challenge out of a login answer, or null when that answer is a session. */
export function twoFactorPrompt(payload: Record<string, unknown>): TwoFactorPrompt | null {
  const asked = payload.twoFactor as Record<string, unknown> | undefined;
  if (!asked || typeof asked.challengeId !== 'string' || !asked.challengeId) return null;
  return {
    challengeId: asked.challengeId,
    expiresIn: typeof asked.expiresIn === 'number' ? asked.expiresIn : 300,
  };
}

export function createTwoFactorApi(call: Call, deviceName: string): TwoFactorApi {
  const session = (payload: Record<string, unknown>): AccountSession => ({
    token: text(payload.token, 'session'),
    user: parseAccount(payload.user),
  });
  return {
    twoFactorState: async (token) => {
      const data = await call('GET', '/api/account/2fa', undefined, token);
      return {
        enabled: data.enabled === true,
        available: data.available !== false,
        confirmedAt: typeof data.confirmedAt === 'string' ? data.confirmedAt : null,
        recoveryCodesLeft: typeof data.recoveryCodesLeft === 'number' ? data.recoveryCodesLeft : 0,
      };
    },
    startTwoFactor: async (token) => {
      const data = await call('POST', '/api/account/2fa/start', {}, token);
      const uri = text(data.uri, 'setup link');
      // A link that is not otpauth: would be handed to whatever app claims it instead,
      // which is not something an account's secret should be trusted to.
      if (!uri.startsWith('otpauth://totp/'))
        throw new AccountError('Vibyra returned an unexpected setup link.', 0);
      return {
        secret: text(data.secret, 'setup key'),
        uri,
        account: typeof data.account === 'string' ? data.account : '',
      };
    },
    confirmTwoFactor: async (token, code) => {
      const data = await call('POST', '/api/account/2fa/confirm', { code }, token);
      return { recoveryCodes: codes(data.recoveryCodes), user: parseAccount(data.user) };
    },
    newRecoveryCodes: async (token, code) =>
      codes((await call('POST', '/api/account/2fa/recovery', { code }, token)).recoveryCodes),
    disableTwoFactor: async (token, code) =>
      parseAccount((await call('DELETE', '/api/account/2fa', { code }, token)).user),
    loginTwoFactor: async (challengeId, code) =>
      session(await call('POST', '/api/auth/login/2fa', { challengeId, code, deviceName })),
  };
}
