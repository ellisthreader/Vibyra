import test from 'node:test';
import assert from 'node:assert/strict';
import { createAccountApi } from '../src/account/accountApi';
import { restoreAccount } from '../src/account/accountActions';
import { RpcClient } from '../src/transport/RpcClient';
import { WorkspaceStore } from '../src/state/WorkspaceStore';

const user = { email: 'ellis@example.com', name: 'Ellis', plan: 'pro', provider: 'email', emailVerified: true, avatarUrl: null };
const SECRET = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP';
const uri = `otpauth://totp/Vibyra:ellis%40example.com?secret=${SECRET}&issuer=Vibyra&algorithm=SHA1&digits=6&period=30`;
type Route = (method: string, path: string, body: Record<string, unknown> | null) => { status: number; body: unknown };

function app(route: Route) {
  const memory = new Map<string, string>();
  const storage = { read: async (key: string) => memory.get(key) ?? null,
    write: async (key: string, value: string) => { memory.set(key, value); }, delete: async (key: string) => { memory.delete(key); } };
  const sent: { path: string; body: Record<string, unknown> | null }[] = [];
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const path = new URL(String(input)).pathname;
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) as Record<string, unknown> : null;
    sent.push({ path, body });
    const reply = route(init?.method ?? 'GET', path, body);
    return new Response(JSON.stringify(reply.body), { status: reply.status });
  }) as typeof fetch;
  const account = createAccountApi({ baseUrl: 'https://api.example.test', deviceName: 'iPhone', fetch: fetchImpl });
  const store = new WorkspaceStore({ rpc: new RpcClient(() => {}, () => 'id'), storage, flags: storage, account, uuid: () => 'u' });
  return { store, memory, sent, signIn: () => restoreAccount(store, JSON.stringify({ token: 'tok', ...user })) };
}

test('a login with a second factor hands back a challenge instead of signing in', async () => {
  const { store, memory } = app((_method, path) => path === '/api/auth/login'
    ? { status: 200, body: { ok: true, twoFactor: { challengeId: 'ch-1', expiresIn: 300 } } }
    : { status: 200, body: { ok: true, token: 'tok', user: { ...user, twoFactorEnabled: true } } });
  const asked = await store.actions.logIn!('ellis@example.com', 'secret123');
  assert.deepEqual(asked, { challengeId: 'ch-1', expiresIn: 300 });
  assert.equal(store.state.account as unknown, null, 'nothing is signed in on a password alone');
  assert.equal(memory.get('account'), undefined, 'and nothing is kept on the phone');

  await store.actions.submitTwoFactorCode!('ch-1', '123 456');
  assert.equal(store.state.account?.email, 'ellis@example.com');
  assert.equal(store.state.account?.twoFactorEnabled, true);
  assert.deepEqual(JSON.parse(memory.get('account')!).token, 'tok');
});
test('a login without one still signs straight in', async () => {
  const { store } = app(() => ({ status: 200, body: { ok: true, token: 'tok', user } }));
  assert.equal(await store.actions.logIn!('ellis@example.com', 'secret123') as unknown, null);
  assert.equal(store.state.account?.email, 'ellis@example.com');
});
test('a code is sent as the server reads it, and an empty one never leaves the phone', async () => {
  const { store, sent, signIn } = app(() => ({ status: 200, body: { ok: true, token: 'tok', user } }));
  await signIn();
  await store.actions.submitTwoFactorCode!('ch-1', ' 123-456 ');
  assert.equal(sent.at(-1)?.body?.code, '123456', 'spaces and dashes are typing, not code');
  await store.actions.submitTwoFactorCode!('ch-1', '  ABCDE-12345 ');
  assert.equal(sent.at(-1)?.body?.code, 'abcde-12345', 'a recovery code goes as it was written, in lower case');
  await assert.rejects(store.actions.submitTwoFactorCode!('ch-1', '   '), /six-digit code/);
  await assert.rejects(store.actions.confirmTwoFactor!('12345'), /six-digit code/);
});
test('a setup link that is not an otpauth link is refused before anything is shown', async () => {
  const bad = app(() => ({ status: 200, body: { ok: true, secret: SECRET, account: user.email, uri: 'https://evil.example/steal' } }));
  await bad.signIn();
  await assert.rejects(bad.store.actions.startTwoFactor!(), /unexpected setup link/);

  const good = app(() => ({ status: 200, body: { ok: true, secret: SECRET, account: user.email, uri } }));
  await good.signIn();
  assert.deepEqual(await good.store.actions.startTwoFactor!(), { secret: SECRET, uri, account: user.email });
});
test('confirming turns the account’s own flag on, so Settings says so without asking again', async () => {
  const codes = ['aaaaa-11111', 'bbbbb-22222'];
  const { store, memory, signIn } = app(() => ({ status: 200,
    body: { ok: true, recoveryCodes: codes, user: { ...user, twoFactorEnabled: true } } }));
  await signIn();
  assert.deepEqual(await store.actions.confirmTwoFactor!('123456'), codes);
  assert.equal(store.state.account?.twoFactorEnabled, true);
  assert.equal(JSON.parse(memory.get('account')!).twoFactorEnabled, true);
});
test('turning it off clears the flag, and the state read says what is left', async () => {
  const { store, signIn } = app((method, path) => path === '/api/account/2fa' && method === 'GET'
    ? { status: 200, body: { ok: true, enabled: true, available: true, confirmedAt: '2026-09-13T10:00:00Z', recoveryCodesLeft: 7 } }
    : { status: 200, body: { ok: true, user: { ...user, twoFactorEnabled: false } } });
  await signIn();
  assert.deepEqual(await store.actions.loadTwoFactor!(),
    { enabled: true, available: true, confirmedAt: '2026-09-13T10:00:00Z', recoveryCodesLeft: 7 });
  await store.actions.disableTwoFactor!('123456');
  assert.equal(store.state.account?.twoFactorEnabled, false);
});
test('signed out, nothing about the second factor is even attempted', async () => {
  const { store, sent } = app(() => ({ status: 200, body: { ok: true } }));
  await assert.rejects(store.actions.loadTwoFactor!(), /Sign in/);
  await assert.rejects(store.actions.startTwoFactor!(), /Sign in/);
  assert.deepEqual(sent, []);
});
