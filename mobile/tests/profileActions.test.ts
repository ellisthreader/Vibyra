import test from 'node:test';
import assert from 'node:assert/strict';
import { createAccountApi, type AccountApi } from '../src/account/accountApi';
import { restoreAccount } from '../src/account/accountActions';
import { RpcClient } from '../src/transport/RpcClient';
import { WorkspaceStore } from '../src/state/WorkspaceStore';

const user = { email: 'ellis@example.com', name: 'Ellis', plan: 'pro', provider: 'email', emailVerified: true, avatarUrl: null };
type Route = (method: string, path: string, body: Record<string, unknown> | null) => { status: number; body: unknown };
function app(route: Route, extra: Partial<AccountApi> = {}) {
  const memory = new Map<string, string>();
  const storage = { read: async (key: string) => memory.get(key) ?? null,
    write: async (key: string, value: string) => { memory.set(key, value); }, delete: async (key: string) => { memory.delete(key); } };
  const seen: string[] = [];
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const path = new URL(String(input)).pathname; const method = init?.method ?? 'GET';
    seen.push(`${method} ${path}`);
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) as Record<string, unknown> : null;
    const reply = route(method, path, body);
    return new Response(JSON.stringify(reply.body), { status: reply.status });
  }) as typeof fetch;
  const account = { ...createAccountApi({ baseUrl: 'https://api.example.test', deviceName: 'iPhone', fetch: fetchImpl }), ...extra };
  const store = new WorkspaceStore({ rpc: new RpcClient(() => {}, () => 'id'), storage, flags: storage, account, uuid: () => 'u' });
  const signIn = async () => { await restoreAccount(store, JSON.stringify({ token: 'tok', ...user })); };
  return { store, memory, seen, signIn };
}
const saved = (memory: Map<string, string>) => JSON.parse(memory.get('account') ?? 'null');

test('a restored account comes back with its photo, provider and confirmation state', async () => {
  const { store, signIn } = app(() => ({ status: 500, body: {} }));
  await signIn();
  assert.deepEqual(store.state.account, user);
});
test('a new name is shown and saved under the same token, so it survives a relaunch', async () => {
  const { store, memory, signIn } = app((_method, _path, body) => ({ status: 200, body: { ok: true, user: { ...user, name: body?.name } } }));
  await signIn();
  await store.actions.updateProfile!({ name: '  Ellis T  ' });
  assert.equal(store.state.account?.name, 'Ellis T');
  assert.deepEqual(saved(memory), { token: 'tok', ...user, name: 'Ellis T' });
  await assert.rejects(store.actions.updateProfile!({ name: '   ' }), /Enter a name/);
  await assert.rejects(store.actions.updateProfile!({ email: 'not an email' }), /valid email/);
});
test('a new photo replaces the account’s, and removing it clears it', async () => {
  const url = 'https://api.example.test/api/account/avatar/1?v=abc';
  const { store, signIn } = app(method => ({ status: 200, body: { ok: true, user: { ...user, avatarUrl: method === 'POST' ? url : null } } }));
  await signIn();
  await store.actions.setAvatar!('data:image/jpeg;base64,/9j/2Q==');
  assert.equal(store.state.account?.avatarUrl, url);
  await store.actions.removeAvatar!();
  assert.equal(store.state.account?.avatarUrl, null);
});
test('removing another device keeps this phone signed in; removing this one signs it out', async () => {
  const { store, memory, signIn } = app((_method, path) =>
    ({ status: 200, body: { ok: true, currentRevoked: path.endsWith('/this-phone') } }));
  await signIn();
  await store.actions.removeAccountDevice!('laptop');
  assert.equal(store.token, 'tok');
  await store.actions.removeAccountDevice!('this-phone');
  assert.equal(store.token, null);
  assert.equal(store.state.account, null);
  assert.equal(memory.get('account'), undefined);
});
test('signing out everywhere signs this phone out only once the server agrees', async () => {
  let up = false;
  const { store, signIn, seen } = app(() => up ? { status: 200, body: { ok: true, currentRevoked: true } }
    : { status: 503, body: { ok: false, error: 'Vibyra is down.' } });
  await signIn();
  await assert.rejects(store.actions.signOutEverywhere!(), /Vibyra is down/);
  assert.equal(store.token, 'tok');
  up = true;
  await store.actions.signOutEverywhere!();
  assert.equal(store.state.account, null);
  assert.equal(seen.at(-1), 'DELETE /api/account/sessions');
});
test('deleting with a password signs out only after the account is gone', async () => {
  const { store, signIn } = app((_method, _path, body) => body?.password === 'right-one'
    ? { status: 200, body: { ok: true } } : { status: 401, body: { ok: false, error: 'Password is incorrect.' } });
  await signIn();
  await assert.rejects(store.actions.deleteAccount!({ password: 'nope' }), /Password is incorrect/);
  assert.equal(store.token, 'tok');
  await assert.rejects(store.actions.deleteAccount!({ password: '' }), /Enter your password/);
  assert.equal(await store.actions.deleteAccount!({ password: 'right-one' }), true);
  assert.equal(store.state.account, null);
});
test('a provider deletion the person backs out of leaves them signed in', async () => {
  let answer = false;
  const calls: unknown[] = [];
  const { store, signIn } = app(() => ({ status: 500, body: {} }), {
    providerDeletion: async (provider, token) => { calls.push([provider, token]); return answer; } });
  await signIn();
  assert.equal(await store.actions.deleteAccount!({ provider: 'google' }), false);
  assert.equal(store.token, 'tok');
  answer = true;
  assert.equal(await store.actions.deleteAccount!({ provider: 'google' }), true);
  assert.equal(store.state.account, null);
  assert.deepEqual(calls, [['google', 'tok'], ['google', 'tok']]);
});
test('signed out, every account action says so instead of calling the server', async () => {
  const { store, seen } = app(() => ({ status: 200, body: { ok: true } }));
  await assert.rejects(store.actions.loadAccountDevices!(), /Sign in/);
  await assert.rejects(store.actions.sendPasswordReset!(), /Sign in/);
  assert.deepEqual(seen, []);
});
