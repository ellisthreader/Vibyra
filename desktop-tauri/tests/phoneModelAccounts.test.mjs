import test from 'node:test';
import assert from 'node:assert/strict';
import { phoneModelAccounts } from '../src/lib/phoneModelAccounts.ts';
const providers = [
  { runtimeId: 'codex', accounts: [{ accountId: 'default', status: 'connected' }] },
  { runtimeId: 'claude', accounts: [{ accountId: 'default', status: 'sign-in-required' }] },
  { runtimeId: 'gemini', accounts: [{ accountId: 'default', status: 'connected' }] },
];
test('disconnected saved defaults and failed providers do not hide a connected provider', async () => {
  const calls = [];
  const result = await phoneModelAccounts(providers, () => 'default', async provider => {
    calls.push(provider);
    if (provider === 'gemini') throw new Error('expired login');
    return { data: [{ id: 'gpt-model' }] };
  });
  assert.deepEqual(calls.sort(), ['codex', 'gemini']);
  assert.deepEqual(result, { codex: [{ id: 'gpt-model' }], claude: [], gemini: [] });
});
test('an account change while discovery runs discards that provider result', async () => {
  let selected = 'default';
  const result = await phoneModelAccounts(providers.slice(0, 1), () => selected, async () => {
    selected = 'different'; return { data: [{ id: 'old-account' }] };
  });
  assert.deepEqual(result.codex, []);
});
