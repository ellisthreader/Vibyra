import assert from 'node:assert/strict';
import test from 'node:test';
import { VibesError, validateWallet } from '../src/vibes/api';
import { VibesStore } from '../src/vibes/VibesStore';
import { buyVibes, claimPending } from '../src/vibes/purchases';
import { benefitsFor, defaultOffer, offers } from '../src/vibes/plans';
import { sampleVibesApi } from '../src/demo/sampleVibes';
import type { PurchaseBridge, VibesApi, VibesProduct, VibesTurn, VibesWallet } from '../src/vibes/types';

const free = { maxProjects: 1, concurrentReplies: 1, fullCatalogue: false, remoteAccess: false };
const pro = { maxProjects: null, concurrentReplies: 3, fullCatalogue: true, remoteAccess: true };
const wallet: VibesWallet = { version: 1, available: 100, held: 0, total: 100, paidAvailable: 0, plan: 'free',
  paidUntil: null, trialChatsRemaining: 2, accountToken: 'account-one', consented: true, verified: true,
  purchasesEnabled: true, products: [{ id: 'starter', credits: 350, pence: 2000, kind: 'subscription', plan: 'starter' }],
  entitlements: free, planEntitlements: { free, pro }, remoteAccessLive: false, usedProjects: 0 };
const turn: VibesTurn = { id: 'request-one', chatId: 'chat-one', model: 'auto', status: 'queued', prompt: 'Hello',
  response: null, error: null, reserved: 2, charged: 0, createdAt: '2026-09-09' };
function fixture(overrides: Partial<VibesApi> = {}) {
  let saved = ''; let submissions = 0;
  const api: VibesApi = {
    wallet: async () => wallet, models: async () => [], chats: async () => [],
    createChat: async id => [{ id, title: 'Chat', trial_slot: null, trial_used: 0 }],
    turns: async () => [], turn: async () => turn, quote: async () => ({ quote: 'quote', maxCredits: 2, estimatedCredits: 1, model: 'auto', expiresAt: Date.now() / 1000 + 60 }),
    submit: async () => { submissions++; return turn; }, cancel: async () => {}, consent: async () => {},
    purchase: async () => wallet, ...overrides,
  };
  const store = new VibesStore(api, () => 'request-one', { read: async () => saved, write: async value => { saved = value; } });
  return { store, api, saved: () => saved, submissions: () => submissions };
}
test('duplicate taps dispatch one request and persist its ID before dispatch', async () => {
  const f = fixture(); await f.store.initialize();
  await Promise.all([f.store.send('quote'), f.store.send('quote')]);
  assert.equal(f.submissions(), 1);
  assert.equal(JSON.parse(f.saved()).pending, 'request-one');
});
test('lost response keeps pending identity and refresh never resubmits', async () => {
  let submitted = 0;
  const f = fixture({ submit: async () => { submitted++; throw new VibesError('Connection interrupted', 0); } });
  await f.store.initialize(); assert.equal(await f.store.send('quote'), false);
  await f.store.refresh(); assert.equal(f.store.state.pending, 'request-one'); assert.equal(submitted, 1);
});
test('authoritative payment rejection releases pending submission', async () => {
  const f = fixture({ submit: async () => { throw new VibesError('Upgrade to continue', 402); } });
  await f.store.initialize(); assert.equal(await f.store.send('quote'), false);
  assert.equal(f.store.state.pending, null);
});
test('finished turn clears pending state and missing request does not auto-send', async () => {
  const f = fixture({ turn: async () => ({ ...turn, status: 'completed' }) });
  await f.store.initialize(); await f.store.send('quote'); assert.equal(f.store.state.pending, null);
  const missing = fixture({ turn: async () => { throw new VibesError('Missing', 404); } });
  await missing.store.initialize(); missing.store.update({ pending: 'unknown' }); await missing.store.refresh();
  assert.equal(missing.store.state.pending, null); assert.equal(missing.submissions(), 0);
});
test('concurrent chat creation reuses one in-flight identity', async () => {
  let creates = 0;
  const f = fixture({ createChat: async () => { creates++; return []; } });
  await Promise.all([f.store.chat('one'), f.store.chat('one')]); assert.equal(creates, 1);
});
test('invalid or negative server balances are rejected', () => {
  assert.throws(() => validateWallet({ ...wallet, available: -1 }));
  assert.throws(() => validateWallet({ ...wallet, held: 0.5 }));
  assert.deepEqual(validateWallet(wallet), wallet);
});
test('store transactions finish only after server acceptance; cancellation grants nothing', async () => {
  const events: string[] = []; const f = fixture({ purchase: async () => { events.push('verify'); return wallet; } });
  const bridge: PurchaseBridge = { products: async () => [], pending: async () => [], restore: async () => [],
    buy: async () => ({ transactionId: '123', productId: 'starter' }), finish: async () => { events.push('finish'); } };
  await buyVibes(f.api, bridge, 'starter', wallet); assert.deepEqual(events, ['verify', 'finish']);
  events.length = 0;
  await buyVibes(f.api, { ...bridge, buy: async () => null }, 'starter', wallet); assert.deepEqual(events, []);
  await assert.rejects(buyVibes({ ...f.api, purchase: async () => { throw new Error('Offline'); } }, bridge, 'starter', wallet));
  assert.deepEqual(events, []);
});
test('restore leaves another account’s unfinished purchase untouched and restores the current account', async () => {
  const verified: string[] = []; const finished: string[] = [];
  const f = fixture({ purchase: async id => { verified.push(id); return wallet; } });
  const bridge: PurchaseBridge = { products: async () => [], pending: async () => [], buy: async () => null,
    restore: async () => [{ transactionId: 'other', productId: 'starter', accountToken: 'another-account' },
      { transactionId: 'mine', productId: 'starter', accountToken: wallet.accountToken }],
    finish: async id => { finished.push(id); } };
  await claimPending(f.api, bridge, true);
  assert.deepEqual(verified, ['mine']); assert.deepEqual(finished, ['mine']);
});
test('a late chat creation cannot replace a deliberately selected conversation', async () => {
  let resolve!: (value: []) => void;
  const f = fixture({ createChat: () => new Promise(r => { resolve = r; }) });
  const creating = f.store.chat('new'); await f.store.select('existing'); resolve([]);
  await assert.rejects(creating, /selected chat changed/);
  assert.equal(f.store.state.selected, 'existing');
});
test('a backend without entitlements falls back to the floor rather than widening access', () => {
  const w = validateWallet({ ...wallet, entitlements: undefined, planEntitlements: undefined,
    remoteAccessLive: undefined, usedProjects: undefined });
  assert.deepEqual(w.entitlements, { maxProjects: 1, concurrentReplies: 1, fullCatalogue: false, remoteAccess: false });
  assert.equal(w.remoteAccessLive, false);
  assert.deepEqual(w.planEntitlements, {});
  const spoofed = validateWallet({ ...wallet, entitlements: { maxProjects: -4, concurrentReplies: 0, fullCatalogue: 'yes', remoteAccess: 1 } });
  assert.deepEqual(spoofed.entitlements, { maxProjects: 1, concurrentReplies: 1, fullCatalogue: false, remoteAccess: false });
  assert.equal(validateWallet({ ...wallet, entitlements: { ...pro } }).entitlements.maxProjects, null);
});
test('the upgrade screen offers only higher plans and defaults to the middle one', () => {
  const products: VibesProduct[] = [
    { id: 'starter', plan: 'starter', credits: 350, pence: 2000, kind: 'subscription' },
    { id: 'builder', plan: 'builder', credits: 1000, pence: 4900, kind: 'subscription' },
    { id: 'pro', plan: 'pro', credits: 2000, pence: 9900, kind: 'subscription' },
    { id: 'topup', plan: null, credits: 500, pence: 2000, kind: 'topup' },
  ];
  const free = offers({ ...wallet, products });
  assert.deepEqual(free.map(p => p.plan), ['starter', 'builder', 'pro']);
  assert.equal(defaultOffer(free), 'builder');
  const builder = offers({ ...wallet, products, plan: 'builder' });
  assert.deepEqual(builder.map(p => p.plan), ['pro']);
  assert.equal(defaultOffer(builder), 'pro');
  assert.deepEqual(offers({ ...wallet, products, plan: 'pro' }), []);
});
test('an entitlement that is not switched on is shown as pending, never as ready', () => {
  const product: VibesProduct = { id: 'pro', plan: 'pro', credits: 2000, pence: 9900, kind: 'subscription' };
  const wait = benefitsFor(product, { ...wallet, planEntitlements: { pro }, remoteAccessLive: false });
  assert.equal(wait.find(b => b.label.includes('Remote access'))?.status, 'Coming soon');
  assert.ok(wait.some(b => b.label === 'Every model on OpenRouter'));
  assert.ok(wait.some(b => b.label === 'Unlimited projects'));
  const live = benefitsFor(product, { ...wallet, planEntitlements: { pro }, remoteAccessLive: true });
  assert.equal(live.find(b => b.label.includes('Remote access'))?.status, undefined);
  // A plan without the entitlement must not advertise it at all.
  const starter: VibesProduct = { id: 'starter', plan: 'starter', credits: 350, pence: 2000, kind: 'subscription' };
  const limited = benefitsFor(starter, { ...wallet, planEntitlements: { starter: { ...free, maxProjects: 3 } } });
  assert.ok(!limited.some(b => b.label.includes('Remote access')));
  assert.ok(limited.some(b => b.label === '3 projects at a time'));
});
test('the sample workspace has a wallet, so a signed-in demo never reads as signed out', async () => {
  // The reported bug: demo forced `identity` to null, the wallet stayed null, and
  // the rail read "no wallet" as "signed out" and sent the user to Settings.
  const w = validateWallet(await sampleVibesApi.wallet());
  assert.equal(w.plan, 'free');
  assert.equal(w.purchasesEnabled, false, 'a sample workspace can show plans but never sell one');
  assert.deepEqual(offers(w).map(p => p.plan), ['starter', 'builder', 'pro'], 'the upgrade page is reachable in the sample');
  assert.equal(w.planEntitlements.pro.fullCatalogue, true);
  assert.equal(defaultOffer(offers(w)), 'builder');
});
test('the sample workspace cannot spend, purchase or start real work', async () => {
  for (const call of [
    () => sampleVibesApi.createChat('id', 'title'),
    () => sampleVibesApi.quote('chat', 'text', 'auto'),
    () => sampleVibesApi.submit('id', 'quote'),
    () => sampleVibesApi.purchase('transaction', 'product'),
  ]) await assert.rejects(call(), /sample workspace/);
});
