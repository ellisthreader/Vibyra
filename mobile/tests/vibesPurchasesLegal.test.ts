import assert from 'node:assert/strict';
import test from 'node:test';
import { buyVibes, claimPending } from '../src/vibes/purchases';
import type { PurchaseBridge, VibesApi, VibesWallet } from '../src/vibes/types';

const base = {
  version: 2, accountToken: 'one', purchasesEnabled: true,
  salesCapabilities: { apple: true, stripe: false },
  products: [{ id: 'pro', kind: 'subscription', plan: 'pro_v2', credits: 300, pence: 1999, appleEnabled: false }],
} as VibesWallet;

test('v2 native purchase requires global Apple activation and an enabled offer', async () => {
  const events: string[] = [];
  const api = { purchasePreflight: async () => { events.push('preflight'); },
    purchase: async () => { events.push('verify'); return base; } } as unknown as VibesApi;
  const bridge: PurchaseBridge = { products: async () => [], pending: async () => [], restore: async () => [],
    buy: async () => { events.push('buy'); return { transactionId: 'transaction', productId: 'pro' }; },
    finish: async () => { events.push('finish'); } };
  await assert.rejects(buyVibes(api, bridge, 'pro', base), /not available/);
  await assert.rejects(buyVibes(api, bridge, 'pro', { ...base, salesCapabilities: { apple: false, stripe: false },
    products: [{ ...base.products[0], appleEnabled: true }] }), /not available/);
  assert.deepEqual(events, [], 'no StoreKit sheet opens for a disabled offer');
  const enabled = { ...base, products: [{ ...base.products[0], appleEnabled: true }] };
  await buyVibes(api, bridge, 'pro', enabled);
  assert.deepEqual(events, ['preflight', 'buy', 'verify', 'finish']);
});

test('turning off new sales does not block restoration of an earlier purchase', async () => {
  const events: string[] = [];
  const wallet = { ...base, purchasesEnabled: false, salesCapabilities: { apple: false, stripe: false } };
  const api = { wallet: async () => wallet, purchase: async () => { events.push('verify'); return wallet; } } as unknown as VibesApi;
  const bridge: PurchaseBridge = { products: async () => [], pending: async () => [], buy: async () => null,
    restore: async () => [{ transactionId: 'older', productId: 'pro', accountToken: 'one' }],
    finish: async () => { events.push('finish'); } };
  await claimPending(api, bridge, true);
  assert.deepEqual(events, ['verify', 'finish']);
});
