import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runtimeHarness } from './runtimeHarness';
import { handOverGuestState } from '../src/vibes/guestHandover';
import { vibesStateKey } from '../src/vibes/guestKeys';
import { VibesStore } from '../src/vibes/VibesStore';
import type { VibesApi } from '../src/vibes/types';
import { wallet } from './vibes.test';

/**
 * Changing who is signed in on this phone. Phone chats and their open-chat
 * memory belong to an identity; a computer's pairing belongs to the phone.
 */
const guestState = JSON.stringify({ pending: null, selected: 'chat-e', model: 'auto', effort: null });
const account = vibesStateKey('ellis@example.com');

test('sign-up converts the guest, so the account inherits the chat the guest had open', async () => {
  const h = runtimeHarness(); await h.store.initialize();
  h.memory.set('vibes-guest-token', 'guest-token'); h.flags.set(vibesStateKey(null), guestState);
  await h.store.actions.signUp!('ellis@example.com', 'longenough');
  assert.equal(h.flags.get(account), guestState, 'the converted guest opens on the same chat');
  assert.equal(h.flags.has(vibesStateKey(null)), false, 'nothing is left for the next guest to pick up');
  assert.equal(h.memory.has('vibes-guest-token'), false);
  h.store.dispose();
});
test('login leaves the guest behind: its open chat is dropped, not handed to the account or the next guest', async () => {
  const h = runtimeHarness(); await h.store.initialize();
  h.memory.set('vibes-guest-token', 'guest-token'); h.flags.set(vibesStateKey(null), guestState);
  await h.store.actions.logIn!('ellis@example.com', 'longenough');
  assert.equal(h.flags.has(account), false, 'a login is not a conversion');
  assert.equal(h.flags.has(vibesStateKey(null)), false);
  assert.equal(h.memory.has('vibes-guest-token'), false);
  await h.store.actions.logOut!();
  assert.equal(h.flags.has(vibesStateKey(null)), false, 'the guest made after Log out starts on no chat');
  h.store.dispose();
});
test('a sign-up with no guest to convert hands nothing over, and an account keeps its own memory', async () => {
  const flags = new Map<string, string>();
  const api = { read: async (key: string) => flags.get(key) ?? null, write: async (key: string, value: string) => { flags.set(key, value); },
    delete: async (key: string) => { flags.delete(key); } };
  flags.set(vibesStateKey(null), guestState);
  await handOverGuestState(api, 'ellis@example.com', false);
  assert.deepEqual([...flags.keys()], []);
  flags.set(vibesStateKey(null), guestState); flags.set(account, 'mine');
  await handOverGuestState(api, 'ellis@example.com', true);
  assert.equal(flags.get(account), 'mine', 'a returning account is not overwritten by a stray guest');
  assert.equal(flags.has(vibesStateKey(null)), false);
});
test('signing out clears the account but keeps the computer pairing and onboarding', async () => {
  const h = runtimeHarness(); await h.store.initialize();
  await h.store.actions.completeOnboarding!('phone');
  h.memory.set('connection', JSON.stringify({ pairing: { hostId: 'host1' }, deviceId: 'phone1', trusted: true }));
  await h.store.actions.signUp!('ellis@example.com', 'longenough');
  await h.store.actions.logOut!();
  assert.equal(h.store.state.account, null); assert.equal(h.store.token, null);
  assert.equal(h.memory.has('account'), false);
  assert.ok(h.memory.has('connection'), 'trust in a computer belongs to the phone, not to whoever was signed in');
  assert.ok(h.flags.has('onboarding'));
  h.store.dispose();
});
test('a renewed guest forgets the chat and pending turn the previous guest owned', async () => {
  let saved = guestState;
  const api = { wallet: async () => wallet, chats: async () => [], turns: async () => [], models: async () => [] } as unknown as VibesApi;
  const store = new VibesStore(api, () => 'id', { read: async () => saved, write: async value => { saved = value; } });
  await store.initialize();
  assert.equal(store.state.selected, 'chat-e');
  await store.forgetChat();
  assert.equal(store.state.selected, null); assert.equal(store.state.pending, null); assert.equal(store.state.draftScope, 'new');
  assert.equal(JSON.parse(saved).selected, null, 'forgotten on disk too, so a relaunch does not bring it back');
});
