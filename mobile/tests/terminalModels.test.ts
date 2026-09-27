import assert from 'node:assert/strict';
import test from 'node:test';
import { CreateRequests } from '../src/state/createRequest';
import { pickerModels } from '../src/ui/pickerModels';
import { fallbackModels } from '../src/vibes/catalogue';
import { hostState, pairing, runtimeHarness } from './runtimeHarness';

test('different models have separate retry identities; old no-model receipts survive', () => {
  let serial = 0;
  const requests = new CreateRequests(() => String(++serial));
  const key = (model?: string) => requests.key('mac', 'project', 'codex', 'Work', false, model);
  const first = requests.begin(key('openai/gpt-6-sol'));
  assert.equal(requests.begin(key('openai/gpt-6-sol')), first);
  assert.notEqual(requests.begin(key('openai/gpt-6-luna')), first);
  assert.equal(key(), JSON.stringify(['mac', 'project', 'codex', 'Work', false]));
  const restored = new CreateRequests(() => 'new');
  restored.restore(requests.serialize());
  assert.equal(restored.begin(key('openai/gpt-6-sol')), first);
});
test('latest phone cloud models preserve API reasoning and funding metadata', () => {
  const menu = pickerModels(fallbackModels);
  for (const id of ['openai/gpt-6-sol', 'openai/gpt-6-luna', 'anthropic/claude-opus-5.5']) {
    const model = menu.find((model) => model.id === id)!;
    assert.ok(model, id);
    assert.ok(model.reasoning, `${id} must expose reasoning metadata`);
    assert.equal(model.released, '2026-09-22');
    assert.ok(!model.reasoning.efforts.includes('ultra' as never));
    assert.equal(model.trial, false, 'new choices keep the live paid-only funding rule');
  }
  const opus = menu.find((model) => model.id === 'anthropic/claude-opus-5.5')!;
  assert.ok(opus.reasoning);
  assert.equal(opus.reasoning.mandatory, true);
  assert.equal(
    opus.reasoning.defaultEffort,
    'high',
    'OpenRouter metadata differs from the native CLI default',
  );
});

test('Mac capability enables model discovery and the exact ID reaches session.create', async () => {
  const h = runtimeHarness();
  let supported = true;
  h.handle(message => {
    const method = message.payload?.method;
    if (method === 'host.state') h.reply(message, { ...hostState,
      capabilities: { readOnly: true, canInput: true, canManage: true, terminalModelsV1: supported } });
    else if (method === 'session.models') h.reply(message, { models: [{ id: 'openai/gpt-6-sol', name: 'GPT-6 Sol', kind: 'codex', isNew: true }] });
    else if (method === 'session.create') h.reply(message, { ...hostState.sessions[0], kind: 'codex', canInput: true });
    else return false;
    return true;
  });
  await h.store.actions.connect(JSON.stringify(pairing));
  assert.equal(h.store.state.terminalModelsAvailable, true);
  assert.equal((await h.store.actions.listTerminalModels!()).models[0].id, 'openai/gpt-6-sol');
  await h.store.actions.createSession('project1', 'codex', 'Sol', { model: 'openai/gpt-6-sol', safeMode: true });
  const sent = h.sent.find(message => message.payload?.method === 'session.create').payload.params;
  assert.equal(sent.model, 'openai/gpt-6-sol');
  assert.equal(sent.safeMode, true);
  supported = false;
  await h.store.refresh();
  assert.equal(h.store.state.terminalModelsAvailable, false);
  await assert.rejects(h.store.actions.createSession('project1', 'codex', 'Sol', { model: 'openai/gpt-6-sol' }), /cannot start that model/);
  assert.equal(h.sent.filter(message => message.payload?.method === 'session.create').length, 1);
  h.store.dispose();
});
