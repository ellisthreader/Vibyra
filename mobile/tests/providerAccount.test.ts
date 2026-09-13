import test from 'node:test';
import assert from 'node:assert/strict';
import { createAccountApi, type ProviderApi, type AccountSession } from '../src/account/accountApi';
import { browserProvider } from '../src/account/browserProvider';
import { runtimeHarness } from './runtimeHarness';

const session: AccountSession = { token: 'provider-token', user: { email: 'test@example.com', name: 'Test', plan: 'free' } };
function apiHarness(payloads: unknown[]) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const api = createAccountApi({ baseUrl: 'https://example.test', deviceName: 'iPhone',
    fetch: (async (url, init) => { calls.push({ url: String(url), init });
      return new Response(JSON.stringify(payloads.shift()), { status: 200 }); }) as typeof fetch });
  return { api, calls };
}
test('Apple exchanges its single-use challenge and identity token, never a device identity', async () => {
  const { api, calls } = apiHarness([{ ok: true, nonce: 'server-nonce', challengeId: 'challenge' }, { ok: true, ...session }]);
  assert.deepEqual(await api.appleChallenge(), { nonce: 'server-nonce', challengeId: 'challenge' });
  assert.deepEqual(await api.providerToken('signed-identity', 'challenge', 'Test'), session);
  assert.deepEqual(JSON.parse(String(calls[1].init?.body)), {
    provider: 'apple', identityToken: 'signed-identity', challengeId: 'challenge', name: 'Test', deviceName: 'iPhone',
  });
});
test('browser flow accepts only the selected provider HTTPS origin and requires a complete session', async () => {
  const { api, calls } = apiHarness([{ ok: true, flowId: 'secret', authUrl: 'https://accounts.google.com/o/oauth2/v2/auth' },
    { ok: true, status: 'pending' }, { ok: true, status: 'complete', ...session }]);
  assert.equal((await api.startProvider('google')).flowId, 'secret');
  assert.deepEqual(JSON.parse(String(calls[0].init?.body)), { deviceName: 'iPhone' });
  assert.equal(await api.pollProvider('google', 'secret'), null);
  assert.deepEqual(await api.pollProvider('google', 'secret'), session);
  for (const url of ['http://accounts.google.com/auth', 'https://evil.test/auth', 'https://appleid.apple.com/auth',
    'https://accounts.google.com@evil.test/auth', 'https://user:password@accounts.google.com/auth']) {
    await assert.rejects(apiHarness([{ ok: true, flowId: 'secret', authUrl: url }]).api.startProvider('google'), /unexpected sign-in address/);
  }
  await assert.rejects(apiHarness([{ ok: true, status: 'complete' }]).api.pollProvider('google', 'secret'), /unexpected session/);
  await assert.rejects(apiHarness([{ ok: true, challengeId: '', nonce: '' }]).api.appleChallenge(), /could not start/);
});
function browserHarness() {
  const calls: string[] = [];
  const controller = new AbortController();
  let dismissed = false;
  const browser = { open: (url: string) => { calls.push(url); }, closed: () => dismissed, close: () => { calls.push('close'); } };
  const api: ProviderApi = { appleChallenge: async () => ({ nonce: '', challengeId: '' }), providerToken: async () => session,
    startProvider: async () => ({ flowId: 'secret', authUrl: 'https://accounts.google.com/auth' }), pollProvider: async () => session };
  return { api, browser, calls, controller, dismiss: () => { dismissed = true; } };
}
test('provider polling closes the browser on success, cancellation, expiry and errors', async () => {
  const h = browserHarness();
  assert.deepEqual(await browserProvider(h.api, 'google', h.controller.signal, h.browser), session);
  assert.equal(h.calls.at(-1), 'close');
  const cancelled = browserHarness();
  cancelled.api.pollProvider = async () => { cancelled.controller.abort(); return session; };
  assert.equal(await browserProvider(cancelled.api, 'google', cancelled.controller.signal, cancelled.browser), null);
  assert.equal(cancelled.calls.at(-1), 'close');
  const dismissed = browserHarness();
  dismissed.api.pollProvider = async () => { dismissed.dismiss(); return null; };
  assert.equal(await browserProvider(dismissed.api, 'google', dismissed.controller.signal, dismissed.browser, async () => {}), null);
  const expired = browserHarness(); let time = 0;
  expired.api.pollProvider = async () => null;
  await assert.rejects(browserProvider(expired.api, 'google', expired.controller.signal, expired.browser,
    async () => { time = 600001; }, () => time), /expired/);
  assert.equal(expired.calls.at(-1), 'close');
  const failed = browserHarness(); failed.api.startProvider = async () => { throw new Error('Unavailable'); };
  await assert.rejects(browserProvider(failed.api, 'google', failed.controller.signal, failed.browser), /Unavailable/);
  assert.deepEqual(failed.calls, ['close']);
});
test('provider login stores only the verified session, and cancellation never signs in', async () => {
  const h = runtimeHarness();
  h.store.deps.account.socialLogin = async () => session;
  assert.equal(await h.store.actions.providerLogIn!('apple', new AbortController().signal), true);
  assert.equal(JSON.parse(h.memory.get('account')!).token, session.token);
  assert.equal(h.flags.has('account'), false);
  await h.store.actions.logOut!();
  const cancelled = new AbortController(); cancelled.abort();
  assert.equal(await h.store.actions.providerLogIn!('google', cancelled.signal), false);
  assert.equal(h.store.state.account, null);
  assert.equal(h.memory.has('account'), false);
  h.store.dispose();
});

test('cancelling an in-flight provider request returns without a session and closes the browser', async () => {
  const h = browserHarness();
  let ready!: () => void;
  const started = new Promise<void>(resolve => { ready = resolve; });
  h.api.pollProvider = async (_provider, _flow, signal) => new Promise((_resolve, reject) => {
    signal!.addEventListener('abort', () => reject(new Error('Request aborted')), { once: true });
    ready();
  });
  const result = browserProvider(h.api, 'google', h.controller.signal, h.browser);
  await started;
  h.controller.abort();
  assert.equal(await result, null);
  assert.equal(h.calls.at(-1), 'close');
});
