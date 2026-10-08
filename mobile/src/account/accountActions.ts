import type { Account, OnboardingMode, WorkspaceActions } from '../ui/types';
import type { SavedAccount, SavedOnboarding } from '../state/types';
import type { WorkspaceStore } from '../state/WorkspaceStore';
import { AccountError, needsCode, type AccountSession } from './accountApi';
import { makeProfileActions, type ProfileActionName } from './profileActions';
import { makeTwoFactorActions, type TwoFactorActionName } from './twoFactorActions';
import { GUEST_TOKEN_KEY } from '../vibes/guestKeys';
import { handOverGuestState } from '../vibes/guestHandover';

const invalid = 'Enter a valid email and a password with at least 8 characters.';
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function restoreAccount(store: WorkspaceStore, value: string | null) {
  if (!value) return;
  const saved = JSON.parse(value) as SavedAccount;
  if (typeof saved.token !== 'string' || typeof saved.email !== 'string')
    throw new Error('Saved account could not be read. Log in again.');
  store.token = saved.token;
  const { token: _token, ...account } = saved;
  store.update({ account: { ...account, name: saved.name ?? '', plan: saved.plan ?? 'free' } });
}
export async function restoreOnboarding(store: WorkspaceStore) {
  try {
    const value = await store.deps.flags.read('onboarding');
    const saved = value ? (JSON.parse(value) as SavedOnboarding) : null;
    store.update({
      onboarding: saved
        ? { status: 'complete', mode: saved.mode ?? null }
        : { status: 'pending', mode: null },
    });
  } catch (error) {
    // A broken flag store must never trap someone on the welcome gate: let them in and say why.
    store.update({ onboarding: { status: 'complete', mode: null } });
    store.report(error);
  }
}
// Confirms a restored token is still valid. Offline or server trouble keeps the cached account;
// only an explicit rejection signs the phone out.
export async function refreshAccount(store: WorkspaceStore) {
  const token = store.token;
  if (!token) return;
  try {
    const user = await store.deps.account.session(token);
    // Saved as well as shown, so the next launch opens on this photo, not the last one.
    if (store.token === token) await rememberAccount(store, user);
  } catch (error) {
    if (error instanceof AccountError && error.status === 401 && store.token === token)
      await clearAccount(store);
  }
}
/** The account as the server now has it, on screen and on the phone, under the same token. */
export async function rememberAccount(store: WorkspaceStore, user: Account) {
  store.update({ account: user });
  if (!store.token) return;
  const saved: SavedAccount = { token: store.token, ...user };
  await store.deps.storage
    .write('account', JSON.stringify(saved))
    .catch((error) => store.report(error));
}
/** Signed out on this phone: what Log out does, without telling the server, for when the server already knows. */
export async function clearAccount(store: WorkspaceStore) {
  store.token = null;
  store.update({ account: null });
  await store.deps.storage.delete('account');
}
/** A session, kept: on screen, on the phone, and with any guest token left behind.
 *  `converted` says the guest became this account (sign-up), so its open chat comes along. */
export async function keepSession(
  store: WorkspaceStore,
  session: AccountSession,
  converted = false,
) {
  store.token = session.token;
  store.update({ account: session.user, error: null });
  const saved: SavedAccount = { token: session.token, ...session.user };
  // Failing to persist keeps this run signed in; the next launch simply asks again.
  await store.deps.storage
    .write('account', JSON.stringify(saved))
    .catch((error) => store.report(error));
  // A guest session is either converted by sign-up or deliberately left behind
  // by login. It must never reappear as a hidden account after Log out.
  await store.deps.storage.delete(GUEST_TOKEN_KEY).catch((error) => store.report(error));
  await handOverGuestState(store.deps.flags, session.user.email, converted).catch((error) =>
    store.report(error),
  );
}
function credentials(email: string, password: string) {
  const clean = email.trim().toLowerCase();
  if (!emailPattern.test(clean) || password.length < 8) throw new Error(invalid);
  return clean;
}
export function makeAccountActions(
  store: WorkspaceStore,
): Pick<
  WorkspaceActions,
  | 'signUp'
  | 'logIn'
  | 'providerLogIn'
  | 'adoptSession'
  | 'logOut'
  | 'refreshAccount'
  | 'sendHostLink'
  | 'completeOnboarding'
  | 'resetOnboarding'
  | ProfileActionName
  | TwoFactorActionName
> {
  return {
    refreshAccount: () => refreshAccount(store),
    ...makeProfileActions(store),
    ...makeTwoFactorActions(store),
    // The setup step cannot install anything on a computer, so it emails the link
    // there instead. A signed-in phone already has an address and never asks again;
    // a guest types one, because pairing never required an account.
    sendHostLink: async (email?: string) => {
      if (!store.token && !email) throw new Error('Enter the email address to send the link to.');
      return store.deps.account.sendHostLink(store.token, store.token ? undefined : email);
    },
    providerLogIn: async (provider, signal) => {
      if (!store.deps.account.socialLogin)
        throw new Error('Provider sign-in is unavailable. Please use email.');
      const session = await store.deps.account.socialLogin(provider, signal);
      if (!session || signal.aborted) return false;
      await keepSession(store, session);
      return true;
    },
    // A session some other sign-in already made, such as connecting GitHub while signed out.
    adoptSession: async (session) => keepSession(store, session),
    signUp: async (email, password) => {
      const guest = await store.deps.storage.read(GUEST_TOKEN_KEY);
      await keepSession(
        store,
        await store.deps.account.signup(credentials(email, password), password, guest ?? undefined),
        Boolean(guest),
      );
    },
    // A password alone is not always the whole login: an account with a second factor
    // answers with a challenge, which is handed back for the form to ask a code for.
    logIn: async (email, password) => {
      const result = await store.deps.account.login(credentials(email, password), password);
      if (needsCode(result)) return result.twoFactor;
      await keepSession(store, result);
      return null;
    },
    logOut: async () => {
      const token = store.token;
      await clearAccount(store);
      if (token) await store.deps.account.logout(token).catch(() => {});
    },
    completeOnboarding: async (mode: OnboardingMode | null) => {
      store.update({ onboarding: { status: 'complete', mode } });
      const saved: SavedOnboarding = { completedAt: new Date().toISOString(), mode };
      await store.deps.flags
        .write('onboarding', JSON.stringify(saved))
        .catch((error) => store.report(error));
    },
    resetOnboarding: async () => {
      await store.deps.flags.delete('onboarding').catch((error) => store.report(error));
      store.update({ onboarding: { status: 'pending', mode: null } });
    },
  };
}
