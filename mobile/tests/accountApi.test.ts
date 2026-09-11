import test from 'node:test';
import assert from 'node:assert/strict';
import { AccountError, createAccountApi, unreachable } from '../src/account/accountApi';

const user = { id: 1, email: 'ellis@example.com', name: 'Ellis', plan: 'free', creditsBalance: 50 };
function fakeFetch(handler: (url: string, init: RequestInit) => { status: number; body?: unknown } | Error) {
  const requests: { url: string; init: RequestInit }[] = [];
  const impl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input); requests.push({ url, init: init ?? {} });
    const result = handler(url, init ?? {});
    if (result instanceof Error) throw result;
    return new Response(result.body === undefined ? 'not json' : JSON.stringify(result.body), { status: result.status });
  }) as typeof fetch;
  return { requests, api: createAccountApi({ baseUrl: 'https://api.example.test/', deviceName: 'iPhone', fetch: impl }) };
}
test('sign-up posts the backend contract and returns the token and account', async () => {
  const { api, requests } = fakeFetch(() => ({ status: 201, body: { ok: true, token: 'tok-1', user, isNewUser: true } }));
  const session = await api.signup('ellis@example.com', 'longenough');
  assert.deepEqual(session, { token: 'tok-1', user: { email: 'ellis@example.com', name: 'Ellis', plan: 'free' } });
  assert.equal(requests[0].url, 'https://api.example.test/api/auth/signup');
  assert.equal(requests[0].init.method, 'POST');
  assert.deepEqual(JSON.parse(String(requests[0].init.body)), { email: 'ellis@example.com', password: 'longenough', deviceName: 'iPhone' });
  assert.equal((requests[0].init.headers as Record<string, string>)['Content-Type'], 'application/json');
});
test('log-in names the email provider and session reads use the bearer token', async () => {
  const { api, requests } = fakeFetch(url => url.endsWith('/api/session') ? { status: 200, body: { ok: true, user } }
    : { status: 200, body: { ok: true, token: 'tok-2', user } });
  await api.login('ellis@example.com', 'longenough');
  assert.equal(JSON.parse(String(requests[0].init.body)).provider, 'email');
  const account = await api.session('tok-2');
  assert.equal(account.email, 'ellis@example.com');
  assert.equal(requests[1].init.method, 'GET');
  assert.equal((requests[1].init.headers as Record<string, string>).Authorization, 'Bearer tok-2');
  assert.equal(requests[1].init.body, undefined);
  await api.logout('tok-2');
  assert.equal(requests[2].init.method, 'DELETE');
});
test('backend error messages reach the user verbatim with their status', async () => {
  const taken = 'An account already exists for that email. Log in instead.';
  const { api } = fakeFetch(() => ({ status: 409, body: { ok: false, error: taken } }));
  await assert.rejects(api.signup('ellis@example.com', 'longenough'), (error: unknown) =>
    error instanceof AccountError && error.message === taken && error.status === 409);
  const wrong = fakeFetch(() => ({ status: 401, body: { ok: false, error: 'Email or password is incorrect.' } }));
  await assert.rejects(wrong.api.login('ellis@example.com', 'wrongpass1'), /Email or password is incorrect\./);
  const expired = fakeFetch(() => ({ status: 401, body: { ok: false, error: 'Your session expired. Please log in again.' } }));
  await assert.rejects(expired.api.session('stale'), (error: unknown) => error instanceof AccountError && error.status === 401);
});
test('network failures, outages and malformed replies become plain messages, never crashes', async () => {
  const offline = fakeFetch(() => new TypeError('Network request failed'));
  await assert.rejects(offline.api.login('ellis@example.com', 'longenough'), (error: unknown) =>
    error instanceof AccountError && error.message === unreachable && error.status === 0);
  const outage = fakeFetch(() => ({ status: 502 }));
  await assert.rejects(outage.api.signup('ellis@example.com', 'longenough'), /having trouble right now/);
  const html = fakeFetch(() => ({ status: 200 }));
  await assert.rejects(html.api.signup('ellis@example.com', 'longenough'), /could not be reached/);
  const missingToken = fakeFetch(() => ({ status: 200, body: { ok: true, user } }));
  await assert.rejects(missingToken.api.login('ellis@example.com', 'longenough'), /unexpected session/);
  const missingUser = fakeFetch(() => ({ status: 200, body: { ok: true, token: 'tok', user: { id: 9 } } }));
  await assert.rejects(missingUser.api.login('ellis@example.com', 'longenough'), /unexpected account/);
});

// The phone cannot install anything on a computer, so setup asks the backend to
// email the link. The address is the account's own — the call never carries one.
test('the host download link is requested with the bearer token and no email', async () => {
  const { api, requests } = fakeFetch(() => ({ status: 200, body: { ok: true, email: 'ellis@example.com' } }));
  assert.equal(await api.sendHostLink('tok-9'), 'ellis@example.com');
  assert.equal(requests[0].url, 'https://api.example.test/api/account/host-link');
  assert.equal(requests[0].init.method, 'POST');
  assert.equal((requests[0].init.headers as Record<string, string>).Authorization, 'Bearer tok-9');
  assert.deepEqual(JSON.parse(String(requests[0].init.body)), {});
});
test('a rate-limited link request surfaces the backend message', async () => {
  const { api } = fakeFetch(() => ({ status: 429, body: { ok: false, error: 'Please wait 240 seconds before asking for another link.' } }));
  await assert.rejects(() => api.sendHostLink('tok-9'),
    (error: AccountError) => error.status === 429 && /240 seconds/.test(error.message));
});
