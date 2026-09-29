import assert from 'node:assert/strict';
import test from 'node:test';
import { validateWallet } from '../src/vibes/api';
import { formatTokens, tokensFromUnits } from '../src/vibes/tokenUnits';
import { buyVibes } from '../src/vibes/purchases';
import { offers, planNames } from '../src/vibes/plans';
import type { VibesWallet, VibesApi, PurchaseBridge } from '../src/vibes/types';

const raw = { version: 2, unitScale: 10000, accountScope: 'scope-a', revision: '4',
  availableUnits: '1099877', heldUnits: '123', totalUnits: '1100000', paidAvailableUnits: '1000000',
  accountToken: 'scope-a', plan: 'free', trialChatsRemaining: 0, products: [
    { id: 'pro-new', offerKey: 'pro_monthly', offerVersion: '2026-09-27', kind: 'subscription', plan: 'pro_v2', credits: 300, pence: 1999 },
    { id: 'pack', kind: 'topup', plan: null, credits: 80, pence: 499 },
  ], purchasesEnabled: true, spendPolicy: 'balance', limits: null };
test('v2 balances parse exact wire amounts and have no obsolete spend windows', () => {
  const w = validateWallet(raw);
  assert.equal(w.available, 109.9877); assert.equal(w.held, 0.0123);
  assert.equal(w.total, 110); assert.equal(w.limits, null);
  assert.equal(offers(w).length, 1); assert.equal(planNames.pro_v2, 'Pro');
  assert.equal(offers({ ...w, plan: 'pro_v2' }).length, 0);
});
test('malformed units never become a zero balance', () => {
  for (const value of ['-1', '1.2', '1e3', ' 1', '', 100, '9007199254740992'])
    assert.throws(() => tokensFromUnits(value, 10000));
  assert.throws(() => validateWallet({ ...raw, totalUnits: '1' }));
  assert.throws(() => validateWallet({ ...raw, revision: 'not-a-revision' }));
  assert.throws(() => validateWallet({ ...raw, unitScale: 1 }));
});
test('small costs remain visible and displayed maximum rounds upward', () => {
  assert.equal(formatTokens(0.0001), '<0.01');
  assert.equal(formatTokens(0.0123, true), '0.02');
  assert.equal(formatTokens(0), '0');
});
test('subscription preflight failure never opens the store sheet', async () => {
  let buys = 0;
  const api = { purchasePreflight: async () => { throw new Error('Existing subscription'); } } as unknown as VibesApi;
  const bridge = { buy: async () => { buys++; return null; } } as unknown as PurchaseBridge;
  await assert.rejects(buyVibes(api, bridge, 'pro-new', validateWallet(raw) as VibesWallet), /Existing subscription/);
  assert.equal(buys, 0);
});
