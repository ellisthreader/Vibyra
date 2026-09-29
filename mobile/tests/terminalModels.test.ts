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

test('permission changes have separate persistent retry identities', () => {
  let serial = 0;
  const requests = new CreateRequests(() => String(++serial));
  const key = (permission?: 'standard' | 'full') => requests.key('mac', 'p', 'codex', 'Work', false, 'openai/gpt-6-sol', permission);
  const full = requests.begin(key('full'));
  assert.notEqual(full, requests.begin(key('standard')));
  assert.notEqual(full, requests.begin(key()));
  const restored = new CreateRequests(() => 'new');
  restored.restore(requests.serialize());
  assert.equal(restored.begin(key('full')), full);
});

test('permissions are revalidated on the connected computer before launching', async () => {
  const h = runtimeHarness();
  let version: number | undefined = 1;
  h.handle(message => {
    const method = message.payload?.method;
    if (method === 'host.state') h.reply(message, { ...hostState,
      capabilities: { readOnly: true, canInput: true, canManage: true, terminalModelsV1: true } });
    else if (method === 'session.models') h.reply(message, { models: [], permissionsVersion: version, permissionModes: ['standard', 'full'] });
    else if (method === 'session.create') h.reply(message, { ...hostState.sessions[0], kind: 'codex', canInput: true });
    else return false;
    return true;
  });
  await h.store.actions.connect(JSON.stringify(pairing));
  await h.store.actions.createSession('project1', 'codex', 'Work', { permissionMode: 'full', safeMode: true });
  const sent = h.sent.find(message => message.payload?.method === 'session.create').payload.params;
  assert.equal(sent.permissionMode, 'full');
  assert.equal(sent.safeMode, true);
  version = undefined;
  await assert.rejects(h.store.actions.createSession('project1', 'codex', 'Work', { permissionMode: 'standard' }), /Update Vibyra/);
  await assert.rejects(h.store.actions.createSession('project1', 'shell', 'Shell', { permissionMode: 'full' }), /cannot apply/);
  assert.equal(h.sent.filter(message => message.payload?.method === 'session.create').length, 1);
  h.store.dispose();
});
test('latest phone cloud models preserve API reasoning and funding metadata', () => {
  const menu = pickerModels(fallbackModels);
  for (const [id, released, trial] of [
    ['openai/gpt-6-sol', '2026-09-22', false],
    ['openai/gpt-6-luna', '2026-09-22', true],
    ['anthropic/claude-opus-5.5', '2026-09-22', false],
    ['anthropic/claude-sonnet-5.5', '2026-09-28', false],
  ] as const) {
    const model = menu.find((model) => model.id === id)!;
    assert.ok(model, id);
    assert.ok(model.reasoning, `${id} must expose reasoning metadata`);
    assert.equal(model.released, released);
    assert.ok(!model.reasoning.efforts.includes('ultra' as never));
    assert.equal(model.trial, trial, 'offline funding matches the live price ceiling');
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

test('additional computer runners require native capability and exact current model', async () => {
  const h = runtimeHarness();
  let supported = true;
  h.handle(message => {
    const method = message.payload?.method;
    if (method === 'host.state') h.reply(message, { ...hostState,
      capabilities: { readOnly: true, canInput: true, canManage: true, terminalModelsV1: true } });
    else if (method === 'session.models') h.reply(message, {
      runnerKinds: supported ? ['gemini'] : undefined,
      models: [{ id: 'google/gemini-3.5-flash', name: 'Gemini', kind: 'gemini', isNew: false }],
    });
    else if (method === 'session.create') h.reply(message, { ...hostState.sessions[0], kind: 'gemini', canInput: true });
    else return false;
    return true;
  });
  await h.store.actions.connect(JSON.stringify(pairing));
  await h.store.actions.createSession('project1', 'gemini', 'Work', { model: 'google/gemini-3.5-flash' });
  const sent = h.sent.find(message => message.payload?.method === 'session.create').payload.params;
  assert.equal(sent.kind, 'gemini');
  assert.equal(sent.model, 'google/gemini-3.5-flash');
  await assert.rejects(h.store.actions.createSession('project1', 'qwen', 'Work', { model: 'google/gemini-3.5-flash' }), /no longer available/);
  supported = false;
  await assert.rejects(h.store.actions.createSession('project1', 'gemini', 'Work', { model: 'google/gemini-3.5-flash' }), /no longer available/);
  assert.equal(h.sent.filter(message => message.payload?.method === 'session.create').length, 1);
  h.store.dispose();
});

test('deferred Auto carries a stable launch identity across acknowledged retries', async () => {
  const h = runtimeHarness();
  h.handle(message => {
    if (message.payload?.method !== 'session.create') return false;
    h.reply(message, { ...hostState.sessions[0], kind: 'codex', canInput: true }); return true;
  });
  await h.store.actions.connect(JSON.stringify(pairing));
  const requestId = '00000000-0000-4000-8000-000000000123';
  await h.store.actions.createSession('project1', 'codex', 'Vibyra Auto', { requestId });
  await h.store.actions.createSession('project1', 'codex', 'Vibyra Auto', { requestId });
  const requests = h.sent.filter(message => message.payload?.method === 'session.create');
  assert.equal(requests.length, 2);
  assert.deepEqual(requests.map(message => message.payload.params.requestId), [requestId, requestId]);
  h.store.dispose();
});
