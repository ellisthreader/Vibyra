import test from 'node:test';
import assert from 'node:assert/strict';
import { betaReceipt, betaOffer, dismissal, rememberBeta } from '../src/lib/betaWelcomePolicy.ts';
const profile = { welcomeKey:'account-a', emailVerified:true, license:{ endsAt:'2999-01-01T00:00:00Z', betaWelcome:{id:'00000000-0000-4000-8000-000000000001',months:1} } };
test('only a confirmed, unexpired, valid server receipt offers a welcome', () => {
  assert.ok(betaReceipt(profile));
  assert.equal(betaReceipt(null),null);
  assert.equal(betaReceipt({...profile,emailVerified:false}),null);
  assert.equal(betaReceipt({...profile,license:null}),null);
  assert.equal(betaReceipt({...profile,welcomeKey:''}),null);
  for (const endsAt of ['garbage','2020-01-01T00:00:00Z']) assert.equal(betaReceipt({...profile,license:{...profile.license,endsAt}}),null);
  for (const welcome of [null,{id:'bad',months:1},{...profile.license.betaWelcome,months:0},{...profile.license.betaWelcome,months:1.5}]) {
    assert.equal(betaReceipt({...profile,license:{...profile.license,betaWelcome:welcome}}),null);
  }
  assert.ok(betaReceipt({...profile,license:{...profile.license,betaWelcome:{...profile.license.betaWelcome,months:null}}}));
});
test('copy uses actual duration without promising a month for fixed-date licenses', () => {
  assert.equal(betaOffer(1),'One month of Pro. On us.');
  assert.equal(betaOffer(3),'3 months of Pro. On us.');
  assert.equal(betaOffer(null),'Complimentary Pro. Just for you.');
});
test('local dismissals suppress stale receipts and remain account/license scoped with inaccessible storage', () => {
  Object.defineProperty(globalThis,'localStorage',{configurable:true,get(){throw new Error('unavailable');}});
  const receipt=betaReceipt(profile);
  assert.equal(dismissal(receipt),undefined);
  rememberBeta(receipt,'pending');
  assert.equal(dismissal(receipt),'pending');
  assert.equal(dismissal({...receipt,scope:'account-b'}),undefined);
  assert.equal(dismissal({...receipt,id:'00000000-0000-4000-8000-000000000002'}),undefined);
  rememberBeta(receipt,'synced');
  assert.equal(dismissal(receipt),'synced');
});
