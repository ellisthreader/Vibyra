import assert from 'node:assert/strict';
import test from 'node:test';
import { validateWallet } from '../src/vibes/api';
import { fallbackModels } from '../src/vibes/catalogue';
import { defaultOffer, offers } from '../src/vibes/plans';
import { resetSampleVibes, sampleVibesApi, sampleWallet } from '../src/demo/sampleVibes';

test('the sample workspace has a wallet, so a signed-in demo never reads as signed out', async () => {
  // The reported bug: demo forced `identity` to null, the wallet stayed null, and
  // the rail read "no wallet" as "signed out" and sent the user to Settings.
  const w = validateWallet(await sampleVibesApi.wallet());
  assert.equal(w.plan, 'free');
  assert.equal(w.purchasesEnabled, false, 'a sample workspace can show plans but never sell one');
  assert.deepEqual(offers(w).map(p => p.plan), ['starter', 'builder', 'pro'], 'the upgrade page is reachable in the sample');
  assert.equal(w.planEntitlements.pro.fullCatalogue, true);
  assert.equal(defaultOffer(offers(w)), 'pro');
});

// The reported bug: signing in with the test button lost the phone's own chat. The
// sample answers it here instead, the way it answers its terminals and its computer
// conversations, so the test account sees the chat production has - the model Auto
// chose and what the reply costs included - rather than a switched-off page.
test('the sample workspace answers its own chat, and still never sells or reaches a server', async () => {
  resetSampleVibes();
  assert.deepEqual((await sampleVibesApi.createChat('sample-chat', 'A calmer checkout')).map(c => c.title), ['A calmer checkout']);
  const quote = await sampleVibesApi.quote('sample-chat', 'Help me design a simple welcome screen.', 'auto');
  // Auto names the model it chose and why, exactly as the server's quote does, or
  // the composer has nothing to show at the foot of the box but the word "Auto".
  assert.match(quote.auto?.name ?? '', /\w/); assert.match(quote.auto?.reason ?? '', /\w/);
  assert.ok(fallbackModels.some(entry => entry.id === quote.model), 'and it is a model the picker offers');
  assert.ok(quote.maxCredits >= 1 && quote.maxCredits <= sampleWallet.available);
  const turn = await sampleVibesApi.submit('sample-turn', quote.quote);
  assert.equal(turn.status, 'completed'); assert.equal(turn.model, quote.model);
  assert.match(turn.response ?? '', /sample workspace/, 'and the reply says what it is');
  assert.deepEqual((await sampleVibesApi.turns('sample-chat')).map(t => t.id), ['sample-turn']);
  assert.equal((await sampleVibesApi.wallet()).available, sampleWallet.available - turn.charged);
  // A sample sells nothing, so it cannot be spent empty and left a dead end.
  for (const n of [2, 3, 4]) {
    const next = await sampleVibesApi.quote('sample-chat', 'And again.', 'auto');
    assert.ok((await sampleVibesApi.submit(`sample-turn-${n}`, next.quote)).charged >= 1);
  }
  assert.ok((await sampleVibesApi.wallet()).available >= 1, 'the sample never runs out of Vibes');
  await assert.rejects(sampleVibesApi.purchase('transaction', 'product'), /sample workspace/);
  // Leaving forgets the chat, as everything else the sample holds is forgotten.
  resetSampleVibes();
  assert.deepEqual(await sampleVibesApi.chats(), []);
  assert.equal((await sampleVibesApi.wallet()).available, sampleWallet.available);
});
