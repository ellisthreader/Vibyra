import { useMemo, useReducer, useRef, useState } from 'react';
import type { Account, AccountDevice, WorkspaceActions } from '../ui/types';
import type { PreferencesApi } from '../vibes/preferencesApi';
import { createSamplePreferences } from './samplePreferences';

const NOT_SENT = 'This is the test account, so no email was sent.';
const HOUR = 3600 * 1000;
export const sampleStandIn: Account = { email: 'sample@vibyra.app', name: 'Sample account', plan: 'free' };
type SampleActions = Pick<WorkspaceActions, 'updateProfile' | 'setAvatar' | 'removeAvatar' | 'loadAccountDevices'
  | 'removeAccountDevice' | 'sendPasswordReset' | 'resendVerification'>;

/**
 * Settings inside the sample workspace, kept in memory: Personality and Memory (the
 * mockup's, via `createSamplePreferences`), a name and photo that change on screen
 * and nowhere else, and two devices that can be removed. The Test button's account
 * is shown as itself; a sample opened signed out borrows a stand-in so its Account
 * pages still have someone to show. Nothing reaches a server, and it all lasts only
 * until the sample is left (`reset`).
 *
 * The actions are made once: pages key their loading on them, and a fresh function
 * each render would reload a device list forever.
 */
export function useSampleAccount(account: Account | null) {
  const [preferences, setPreferences] = useState<PreferencesApi>(() => createSamplePreferences());
  const held = useRef({ name: null as string | null, avatarUrl: null as string | null, removed: new Set<string>() }).current;
  const [version, changed] = useReducer((count: number) => count + 1, 0);
  // Untouched until a name or photo is changed, so the Test button's account is exactly
  // the one it signed in to; the pages read the sample from `workspace.demo`, not from
  // extra fields on the account.
  const shown = useMemo<Account>(() => {
    const base = account ?? sampleStandIn;
    if (held.name === null && held.avatarUrl === null) return base;
    return { ...base, name: held.name ?? base.name, avatarUrl: held.avatarUrl };
  }, [account, version, held]);
  const current = useRef(shown); current.current = shown;
  const actions = useMemo<SampleActions>(() => ({
    updateProfile: async changes => {
      if (changes.email !== undefined && changes.email.trim().toLowerCase() !== current.current.email)
        throw new Error('The test account’s email can’t be changed.');
      if (changes.name !== undefined) {
        if (!changes.name.trim()) throw new Error('Enter a name.');
        held.name = changes.name.trim(); changed();
      }
    },
    setAvatar: async uri => { held.avatarUrl = uri; changed(); },
    removeAvatar: async () => { held.avatarUrl = null; changed(); },
    loadAccountDevices: async (): Promise<AccountDevice[]> => [
      { id: 'sample-iphone', name: 'iPhone', location: 'London, GB', current: true, lastActive: new Date().toISOString() },
      { id: 'sample-mac', name: 'MacBook Pro', location: 'London, GB', current: false, lastActive: new Date(Date.now() - 3 * HOUR).toISOString() },
    ].filter(device => !held.removed.has(device.id)),
    removeAccountDevice: async id => { held.removed.add(id); changed(); },
    sendPasswordReset: async () => NOT_SENT,
    resendVerification: async () => NOT_SENT,
  }), [held]);
  // This hook outlives the sample (App.tsx always calls it), so leaving the sample has to
  // forget by hand, or the next visit would find the last one's name, photo and memories.
  const reset = () => {
    held.name = null; held.avatarUrl = null; held.removed.clear();
    setPreferences(createSamplePreferences()); changed();
  };
  return { account: account ? shown : null, sampleAccount: account ? undefined : shown, preferences, actions, reset };
}
