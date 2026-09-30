import type { Account, AccountDeletion, WorkspaceActions } from '../ui/types';
import type { WorkspaceStore } from '../state/WorkspaceStore';
import type { ProfileApi } from './profileApi';
import { clearAccount, rememberAccount } from './accountActions';
import { clearDrafts } from '../ui/useDraft';
import { clearAttachmentMemory } from '../vibes/attachmentMemory';
import { clearConversationScrollMemory } from '../vibes/conversationScrollMemory';

export type ProfileActionName =
  | 'updateProfile'
  | 'setAvatar'
  | 'removeAvatar'
  | 'loadAccountDevices'
  | 'removeAccountDevice'
  | 'signOutEverywhere'
  | 'sendPasswordReset'
  | 'resendVerification'
  | 'deleteAccount'
  | 'openBillingPortal';

/**
 * What Settings does to the signed-in account. Each answer that carries the account
 * replaces the one on screen and the one saved, so a new name or photo survives a
 * relaunch. Anything that ends this phone's session — removing this device, signing
 * out everywhere, deleting the account — signs the phone out exactly as Log out does,
 * without telling a server that already knows.
 */
export function makeProfileActions(
  store: WorkspaceStore,
): Pick<WorkspaceActions, ProfileActionName> {
  const signedIn = () => {
    if (!store.token || !store.state.account) throw new Error('Sign in to manage your account.');
    return { token: store.token, account: store.state.account };
  };
  const api = <K extends keyof ProfileApi>(name: K): ProfileApi[K] => {
    const call = store.deps.account[name];
    if (!call) throw new Error('This isn’t available on this phone yet.');
    return call as ProfileApi[K];
  };
  // Only the reply for the account still signed in lands; a sign-out meanwhile wins.
  const keep = async (token: string, reply: Promise<Account>) => {
    const user = await reply;
    if (store.token === token) await rememberAccount(store, user);
  };
  return {
    updateProfile: async (changes) => {
      const { token } = signedIn();
      const name = changes.name?.trim();
      const email = changes.email?.trim().toLowerCase();
      if (changes.name !== undefined && !name) throw new Error('Enter a name.');
      if (changes.email !== undefined && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email ?? ''))
        throw new Error('Enter a valid email address.');
      await keep(
        token,
        api('updateProfile')(token, {
          ...(name !== undefined ? { name } : {}),
          ...(email !== undefined ? { email } : {}),
        }),
      );
    },
    setAvatar: async (uri) => {
      const { token } = signedIn();
      await keep(token, api('uploadAvatar')(token, uri));
    },
    removeAvatar: async () => {
      const { token } = signedIn();
      await keep(token, api('removeAvatar')(token));
    },
    loadAccountDevices: async () => api('devices')(signedIn().token),
    removeAccountDevice: async (id) => {
      const { token } = signedIn();
      const { currentRevoked } = await api('revokeDevice')(token, id);
      if (currentRevoked && store.token === token) await clearAccount(store);
    },
    signOutEverywhere: async () => {
      const { token } = signedIn();
      await api('revokeAllSessions')(token);
      if (store.token === token) await clearAccount(store);
    },
    sendPasswordReset: async () => api('forgotPassword')(signedIn().account.email),
    openBillingPortal: async () => api('billingPortal')(signedIn().token),
    resendVerification: async () => api('resendVerification')(signedIn().account.email),
    deleteAccount: async (proof: AccountDeletion, signal?: AbortSignal) => {
      const { token } = signedIn();
      if ('password' in proof) {
        if (!proof.password) throw new Error('Enter your password to delete your account.');
        await api('deleteWithPassword')(token, proof.password);
      } else if (proof.provider === 'github') {
        await api('deleteSignedIn')(token);
      } else {
        if (!store.deps.account.providerDeletion)
          throw new Error('Deleting this account isn’t available on this phone yet.');
        const deleted = await store.deps.account.providerDeletion(
          proof.provider,
          token,
          signal ?? new AbortController().signal,
        );
        if (!deleted) return false;
      }
      if (store.token === token) {
        const email = store.state.account?.email;
        await clearAccount(store);
        if (email) {
          clearAttachmentMemory(`vibes:${email}:`);
          clearConversationScrollMemory(`vibes:${email}:`);
          await clearDrafts(`vibes:${email}:`).catch((error) => store.report(error));
        }
      }
      return true;
    },
  };
}
