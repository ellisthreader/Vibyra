import assert from 'node:assert/strict';
import test from 'node:test';
import { validateWallet } from '../src/vibes/api';
import { benefitsFor, changesFor, spanOf } from '../src/vibes/plans';
import { free, limits, wallet } from './vibes.test';
import type { VibesProduct } from '../src/vibes/types';

/**
 * The client half of the two rolling usage windows: what the phone accepts from
 * the wallet, and what it says about a window it was not given. The enforcement
 * itself is the backend's, and `VibesUsageWindowsTest` proves that side.
 */
const pro = { maxProjects: null, concurrentReplies: 3, fullCatalogue: true, remoteAccess: true,
  sessionCredits: 400, weekCredits: 1000 };
const offer: VibesProduct = { id: 'pro', plan: 'pro', credits: 2000, pence: 9900, kind: 'subscription' };

test('a window the backend did not publish is left off the page rather than drawn as zero', () => {
  // "0 left of 0" reads as "you have no allowance", which is the opposite of what
  // an older backend means by omitting the figures.
  assert.equal(validateWallet({ ...wallet, limits: undefined }).limits, null);
  assert.equal(validateWallet({ ...wallet, limits: { session: limits.session } }).limits, null,
    'half a pair of meters is worse than neither');
  assert.equal(validateWallet({ ...wallet, limits: { session: { hours: 5, used: 1, limit: 0 }, week: limits.week } }).limits,
    null, 'a window with no allowance at all is not a window');
});

test('the wire names a window after its unit, and a normalized one survives re-validation', () => {
  const read = validateWallet({ ...wallet, limits: {
    session: { hours: 5, used: 12, limit: 400, resetsAt: '2026-09-10T18:00:00Z' },
    week: { days: 7, used: 40, limit: 1000 },
  } }).limits;
  assert.deepEqual(read?.session, { unit: 'hours', span: 5, used: 12, limit: 400, resetsAt: '2026-09-10T18:00:00Z' });
  // `resetsAt` is absent while a window is empty, and is never invented.
  assert.deepEqual(read?.week, { unit: 'days', span: 7, used: 40, limit: 1000, resetsAt: null });
  // The store hands validated wallets back through here; a second pass must not
  // empty what the first one read.
  assert.deepEqual(validateWallet({ ...wallet, limits: read }).limits, read);
});

test('the window length is read from the wallet, never written by the phone', () => {
  assert.equal(spanOf({ unit: 'hours', span: 5, used: 0, limit: 1, resetsAt: null }), '5 hours');
  assert.equal(spanOf({ unit: 'days', span: 7, used: 0, limit: 1, resetsAt: null }), '7 days');
  // A window of one is said as its unit, so "1 days" cannot reach a screen.
  assert.equal(spanOf({ unit: 'days', span: 1, used: 0, limit: 1, resetsAt: null }), 'day');
});

test('the window is sold as an entitlement, and only while the wallet says how long it is', () => {
  const sold = benefitsFor(offer, { ...wallet, planEntitlements: { free, pro } });
  assert.ok(sold.some(b => b.label === '400 Vibes every 5 hours'));
  // No published window means no row, rather than a guessed "5 hours" written here.
  // The monthly allowance is a different line and stays either way.
  const quiet = benefitsFor(offer, { ...wallet, planEntitlements: { free, pro }, limits: null });
  assert.ok(!quiet.some(b => b.label.includes('every 5 hours')));
  assert.ok(quiet.some(b => b.label === '2,000 Vibes every month'));
});

test('an upgrade lists a window it moves and prunes one it does not', () => {
  const moved = changesFor(offer, { ...wallet, entitlements: free, planEntitlements: { free, pro } });
  assert.deepEqual(moved.find(c => c.label === 'Vibes every 5 hours'), { label: 'Vibes every 5 hours', from: '60', to: '400' });
  assert.deepEqual(moved.find(c => c.label === 'Vibes every 7 days'), { label: 'Vibes every 7 days', from: '150', to: '1,000' });
  // An entitlement the upgrade does not move is not a reason to upgrade.
  const same = changesFor(offer, { ...wallet, entitlements: pro, planEntitlements: { free, pro } });
  assert.ok(!same.some(c => c.label.startsWith('Vibes every')));
});
