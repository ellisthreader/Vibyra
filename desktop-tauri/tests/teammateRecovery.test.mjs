import test from 'node:test';
import assert from 'node:assert/strict';
import { restoreThread, saveThread, confirmedTurn, validateTurns } from '../src/components/teammates/threadStorage.ts';
import { submitThread } from '../src/components/teammates/threadRequests.ts';
const pending = { id: 'send-1', quote: 'exact-signed-quote', text: 'Please review this' };
const receipt = { turn: { id: pending.id, chatId: 'chat-1', prompt: pending.text } };
test('attachments survive an empty draft, app restart and model changes', () => {
  const data = { draft: '', pending: null, model: 'example/model', effort: 'high', attachments: [{ id: 'file-1', name: 'review.txt', bytes: 19 }] };
  let stored; saveThread('account.chat', data, { setItem: (_, value) => { stored = value; } });
  assert.deepEqual(restoreThread(stored), data);
});
test('legacy exact sends restore and corrupt pending data fails closed', () => {
  assert.deepEqual(restoreThread(JSON.stringify({ draft: pending.text, pending })).pending, pending);
  for (const raw of ['{', '[]', JSON.stringify({ pending: { id: 'send-1' } })]) assert.ok(restoreThread(raw).recoveryError);
  assert.equal(restoreThread(null).recoveryError, undefined);
});
test('a matching receipt clears only its own conversation and prompt', () => {
  assert.equal(confirmedTurn(receipt, 'chat-1', pending).id, pending.id);
  for (const turn of [{ ...receipt.turn, chatId: 'other' }, { ...receipt.turn, id: 'other' }, { ...receipt.turn, prompt: 'other' }]) assert.throws(() => confirmedTurn({ turn }, 'chat-1', pending), /does not match/);
  assert.throws(() => validateTurns({ turns: [receipt.turn] }, 'other'), /invalid conversation/);
});
for (const status of [400, 401, 402, 403, 404, 409, 422, 429]) {
  test(`a ${status} refusal with confirmed absence releases the send for editing`, async () => {
    let released = 0, calls = [];
    await assert.rejects(submitThread(async (path, body) => { calls.push([path, body]); throw new Error(path === 'vibes/turns' ? `${status}: Refused` : '404: Not found'); }, 'chat-1', pending, () => released++), new RegExp(`${status}:`));
    assert.equal(released, 1); assert.deepEqual(calls[0][1], { id: pending.id, quote: pending.quote }); assert.equal(calls[1][0], 'vibes/turns/send-1');
  });
}
test('an uncertain POST or lookup retains the exact send', async () => {
  for (const failure of ['503: Unavailable', 'Connection interrupted', '409: Already used']) {
    let released = 0;
    await assert.rejects(submitThread(async path => { throw new Error(path === 'vibes/turns' ? failure : 'Connection interrupted'); }, 'chat-1', pending, () => released++));
    assert.equal(released, 0);
  }
});
test('a retry recovers a previously accepted send without creating a new one', async () => {
  let released = 0;
  const turn = await submitThread(async path => { if (path === 'vibes/turns') throw new Error('409: Already used'); return receipt; }, 'chat-1', pending, () => released++);
  assert.equal(turn.id, pending.id); assert.equal(released, 0);
});
test('an unrelated or malformed receipt never discards the original message', async () => {
  for (const result of [{}, { turn: { ...receipt.turn, chatId: 'other' } }]) {
    let released = 0;
    await assert.rejects(submitThread(async () => result, 'chat-1', pending, () => released++), /does not match/);
    assert.equal(released, 0);
  }
});

test('profile recovery preserves the exact pending request and base revision', async () => {
  const { restoreSetup } = await import('../src/components/teammates/setupStorage.ts');
  const fields = { name:'Reviewer', brief:'Review changes', memory:'', avatar:'review', budget:5, integrations:[], skillIds:[], model:'auto' };
  const body = { ...fields, id:'123e4567-e89b-42d3-a456-000000000001' };
  const result = restoreSetup(JSON.stringify({ fields, pending:body }));
  assert.equal(result.error,''); assert.deepEqual(result.pending,body);
  for (const invalid of [{fields:{}}, {fields,pending:{id:body.id}}, {fields,revision:'2'}]) assert.ok(restoreSetup(JSON.stringify(invalid)).error);
});
