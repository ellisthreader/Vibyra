import type { OnboardingMode, WorkspaceActions } from '../ui/types';
import type { SavedAccount, SavedOnboarding } from '../state/types';
import type { WorkspaceStore } from '../state/WorkspaceStore';
import { AccountError, type AccountSession } from './accountApi';

const invalid = 'Enter a valid email and a password with at least 8 characters.';
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function restoreAccount(store: WorkspaceStore, value: string | null) {
  if (!value) return;
  const saved = JSON.parse(value) as SavedAccount;
  if (typeof saved.token !== 'string' || typeof saved.email !== 'string') throw new Error('Saved account could not be read. Log in again.');
  store.token = saved.token;
  store.update({ account: { email: saved.email, name: saved.name ?? '', plan: saved.plan ?? 'free' } });
}
export async function restoreOnboarding(store: WorkspaceStore) {
  try {
    const value = await store.deps.flags.read('onboarding');
    const saved = value ? JSON.parse(value) as SavedOnboarding : null;
    store.update({ onboarding: saved ? { status: 'complete', mode: saved.mode ?? null } : { status: 'pending', mode: null } });
  } catch (error) {
    // A broken flag store must never trap someone on the welcome gate: let them in and say why.
    store.update({ onboarding: { status: 'complete', mode: null } }); store.report(error);
  }
}
// Confirms a restored token is still valid. Offline or server trouble keeps the cached account;
// only an explicit rejection signs the phone out.
export async function refreshAccount(store: WorkspaceStore) {
  const token = store.token;
  if (!token) return;
  try {
    const user = await store.deps.account.session(token);
    if (store.token === token) store.update({ account: user });
  } catch (error) {
    if (error instanceof AccountError && error.status === 401 && store.token === token) await clearAccount(store);
  }
}
async function clearAccount(store: WorkspaceStore) {
  store.token = null; store.update({ account: null });
  await store.deps.storage.delete('account');
}
async function keep(store: WorkspaceStore, session: AccountSession) {
  store.token = session.token; store.update({ account: session.user, error: null });
  const saved: SavedAccount = { token: session.token, ...session.user };
  // Failing to persist keeps this run signed in; the next launch simply asks again.
  await store.deps.storage.write('account', JSON.stringify(saved)).catch(error => store.report(error));
}
function credentials(email: string, password: string) {
  const clean = email.trim().toLowerCase();
  if (!emailPattern.test(clean) || password.length < 8) throw new Error(invalid);
  return clean;
}
export function makeAccountActions(store: WorkspaceStore): Pick<WorkspaceActions,
  'signUp' | 'logIn' | 'logOut' | 'completeOnboarding' | 'resetOnboarding'> {
  return {
    signUp: async (email, password) => keep(store, await store.deps.account.signup(credentials(email, password), password)),
    logIn: async (email, password) => keep(store, await store.deps.account.login(credentials(email, password), password)),
    logOut: async () => {
      const token = store.token;
      await clearAccount(store);
      if (token) await store.deps.account.logout(token).catch(() => {});
    },
    completeOnboarding: async (mode: OnboardingMode | null) => {
      store.update({ onboarding: { status: 'complete', mode } });
      const saved: SavedOnboarding = { completedAt: new Date().toISOString(), mode };
      await store.deps.flags.write('onboarding', JSON.stringify(saved)).catch(error => store.report(error));
    },
    resetOnboarding: async () => {
      await store.deps.flags.delete('onboarding').catch(error => store.report(error));
      store.update({ onboarding: { status: 'pending', mode: null } });
    },
  };
}
