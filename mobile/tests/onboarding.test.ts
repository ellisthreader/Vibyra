import test from 'node:test';
import assert from 'node:assert/strict';
import { AccountError } from '../src/account/accountApi';
import { delay, runtimeHarness } from './runtimeHarness';

test('a cold start is unknown until storage answers, then pending on a fresh phone', async () => {
  const h = runtimeHarness();
  assert.equal(h.store.state.onboarding.status, 'unknown');
  await h.store.initialize();
  assert.deepEqual(h.store.state.onboarding, { status: 'pending', mode: null });
  assert.equal(h.store.state.account, null);
  h.store.dispose();
});
test('completing the welcome flow persists a non-secret flag that survives a relaunch', async () => {
  const h = runtimeHarness(); await h.store.initialize();
  await h.store.actions.completeOnboarding!('computer');
  assert.deepEqual(h.store.state.onboarding, { status: 'complete', mode: 'computer' });
  const saved = JSON.parse(h.flags.get('onboarding')!);
  assert.equal(saved.mode, 'computer'); assert.ok(Date.parse(saved.completedAt));
  assert.equal(h.memory.has('onboarding'), false, 'the flag never lands in the secret store');
  h.store.dispose();
  const again = runtimeHarness(); again.flags.set('onboarding', h.flags.get('onboarding')!);
  await again.store.initialize();
  assert.deepEqual(again.store.state.onboarding, { status: 'complete', mode: 'computer' });
  await again.store.actions.resetOnboarding!();
  assert.deepEqual(again.store.state.onboarding, { status: 'pending', mode: null });
  assert.equal(again.flags.has('onboarding'), false);
  again.store.dispose();
});
test('skipping records no mode and a broken flag store never traps anyone on the gate', async () => {
  const h = runtimeHarness(); await h.store.initialize();
  await h.store.actions.completeOnboarding!(null);
  assert.deepEqual(h.store.state.onboarding, { status: 'complete', mode: null });
  h.store.dispose();
  const broken = runtimeHarness();
  broken.store.deps.flags.read = async () => { throw new Error('Keychain unavailable'); };
  broken.store.deps.flags.write = async () => { throw new Error('Keychain unavailable'); };
  await broken.store.initialize();
  assert.equal(broken.store.state.onboarding.status, 'complete');
  assert.match(broken.store.state.error!, /Keychain unavailable/);
  broken.store.update({ onboarding: { status: 'pending', mode: null }, error: null });
  await broken.store.actions.completeOnboarding!('phone');
  assert.equal(broken.store.state.onboarding.status, 'complete');
  assert.match(broken.store.state.error!, /Keychain unavailable/);
  broken.store.dispose();
});
test('sign-up validates locally, keeps the token only in secure storage and exposes the account', async () => {
  const h = runtimeHarness(); await h.store.initialize();
  await assert.rejects(h.store.actions.signUp!('not-an-email', 'longenough'), /valid email/);
  await assert.rejects(h.store.actions.signUp!('ellis@example.com', 'short'), /8 characters/);
  assert.equal(h.calls.length, 0, 'invalid input never reaches the network');
  await h.store.actions.signUp!('  Ellis@Example.com ', 'longenough');
  assert.deepEqual(h.calls.at(-1), ['signup', 'ellis@example.com', 'longenough']);
  assert.deepEqual(h.store.state.account, { email: 'ellis@example.com', name: 'Ellis', plan: 'free' });
  const saved = JSON.parse(h.memory.get('account')!);
  assert.equal(saved.token, 'tok-1'); assert.equal(h.flags.has('account'), false);
  assert.equal(JSON.stringify([...h.flags.values()]).includes('tok-1'), false, 'the token never reaches the flag store');
  await h.store.actions.logOut!();
  assert.equal(h.store.state.account, null); assert.equal(h.memory.has('account'), false);
  assert.deepEqual(h.calls.at(-1), ['logout', 'tok-1']);
  h.store.dispose();
});
test('a saved account restores offline, refreshes quietly and is cleared only by an explicit rejection', async () => {
  const h = runtimeHarness();
  h.memory.set('account', JSON.stringify({ token: 'tok-old', email: 'ellis@example.com', name: 'Old name', plan: 'pro' }));
  h.account.session = async () => { throw new AccountError('Vibyra could not be reached.', 0); };
  await h.store.initialize(); await delay();
  assert.deepEqual(h.store.state.account, { email: 'ellis@example.com', name: 'Old name', plan: 'pro' });
  assert.equal(h.store.state.error, null, 'being offline is not an error on launch');
  h.store.dispose();
  const expired = runtimeHarness();
  expired.memory.set('account', JSON.stringify({ token: 'tok-old', email: 'ellis@example.com', name: 'Old name', plan: 'pro' }));
  expired.account.session = async () => { throw new AccountError('Your session expired. Please log in again.', 401); };
  await expired.store.initialize(); await delay();
  assert.equal(expired.store.state.account, null); assert.equal(expired.memory.has('account'), false);
  expired.store.dispose();
  const fresh = runtimeHarness();
  fresh.memory.set('account', JSON.stringify({ token: 'tok-old', email: 'ellis@example.com', name: 'Old name', plan: 'free' }));
  await fresh.store.initialize(); await delay();
  assert.equal(fresh.store.state.account!.name, 'Ellis');
  await fresh.store.actions.logIn!('ellis@example.com', 'longenough');
  assert.equal(JSON.parse(fresh.memory.get('account')!).token, 'tok-2');
  fresh.store.dispose();
});

// A guest types the address once; a phone that already has one never asks again.
test('the host download link takes a guest address, and a signed-in phone its own', async () => {
  const h = runtimeHarness();
  await h.store.initialize();
  await assert.rejects(() => h.store.actions.sendHostLink!(), /Enter the email address/);
  assert.equal(await h.store.actions.sendHostLink!('guest@example.com'), 'guest@example.com');
  assert.deepEqual(h.calls.at(-1), ['host-link', null, 'guest@example.com']);
  await h.store.actions.signUp!('ellis@example.com', 'longenough');
  assert.equal(await h.store.actions.sendHostLink!(), 'ellis@example.com');
  // Signed in, the token decides the address and nothing typed can override it.
  assert.deepEqual(h.calls.at(-1), ['host-link', 'tok-1', undefined]);
  assert.equal(await h.store.actions.sendHostLink!('stranger@example.com'), 'ellis@example.com');
  assert.deepEqual(h.calls.at(-1), ['host-link', 'tok-1', undefined]);
  h.store.dispose();
});
