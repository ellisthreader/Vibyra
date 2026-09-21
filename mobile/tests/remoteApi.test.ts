import test from 'node:test';
import assert from 'node:assert/strict';
import { createRemoteApi, RemoteError, SIGNED_OUT } from '../src/remote/remoteApi';

const HOST = 'ab'.repeat(32);
const mac = { id: HOST, name: 'Ellis MacBook', platform: 'macos', version: '0.7.5', online: true, lastSeenAt: '2026-09-13T18:00:00Z', activeSessions: 1 };
function fakeFetch(handler: (url: string, init: RequestInit) => { status: number; body?: unknown } | Error, token: string | null = 'tok-1') {
  const requests: { url: string; init: RequestInit }[] = [];
  const impl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input); requests.push({ url, init: init ?? {} });
    const result = handler(url, init ?? {});
    if (result instanceof Error) throw result;
    return new Response(result.body === undefined ? 'not json' : JSON.stringify(result.body), { status: result.status });
  }) as typeof fetch;
  return { requests, api: createRemoteApi('https://api.example.test/', () => token, 'iPhone', impl) };
}

test('the account\'s computers are listed with the bearer token, and junk entries are dropped', async () => {
  const { api, requests } = fakeFetch(() => ({ status: 200, body: { ok: true, live: true, entitled: false,
    computers: [mac, { id: 'not-a-key', name: 'x' }, null, { id: 'cd'.repeat(32), online: 'yes' }] } }));
  const listing = await api.computers();
  assert.deepEqual(listing, { live: true, entitled: false, computers: [mac,
    { id: 'cd'.repeat(32), name: 'Computer', platform: null, version: null, online: false, lastSeenAt: null, activeSessions: 0 }] });
  assert.equal(requests[0].url, 'https://api.example.test/api/remote/hosts');
  assert.equal(requests[0].init.method, 'GET');
  assert.equal((requests[0].init.headers as Record<string, string>).Authorization, 'Bearer tok-1');
});

test('a grant names the relay, the token and the very computer asked for', async () => {
  const { api, requests } = fakeFetch(() => ({ status: 200, body: { ok: true, relayUrl: 'wss://relay.vibyra.test',
    token: 'v1.c.s', expiresIn: 300, host: { ...mac } } }));
  const grant = await api.connect(HOST);
  assert.deepEqual(grant, { relayUrl: 'wss://relay.vibyra.test', token: 'v1.c.s', host: { id: HOST, name: 'Ellis MacBook', platform: 'macos' } });
  assert.equal(requests[0].url, `https://api.example.test/api/remote/hosts/${HOST}/connect`);
  assert.deepEqual(JSON.parse(String(requests[0].init.body)), { clientName: 'iPhone' });
  const other = fakeFetch(() => ({ status: 200, body: { ok: true, relayUrl: 'wss://relay.vibyra.test', token: 't', host: { ...mac, id: 'cd'.repeat(32) } } }));
  await assert.rejects(other.api.connect(HOST), /unexpected grant/);
});

test('refusals arrive in the server\'s words; signed out, offline and outages are said plainly', async () => {
  const offline = 'That computer is not online. Open Vibyra on it and keep it awake.';
  const refused = fakeFetch(() => ({ status: 409, body: { ok: false, error: offline } }));
  await assert.rejects(refused.api.connect(HOST), (error: unknown) => error instanceof RemoteError && error.message === offline && error.status === 409);
  const signedOut = fakeFetch(() => ({ status: 200, body: { ok: true } }), null);
  await assert.rejects(signedOut.api.computers(), (error: unknown) => error instanceof RemoteError && error.message === SIGNED_OUT && error.status === 401);
  assert.equal(signedOut.requests.length, 0, 'nothing is asked without a token');
  const expired = fakeFetch(() => ({ status: 401, body: { ok: false } }));
  await assert.rejects(expired.api.computers(), new RegExp(SIGNED_OUT));
  const down = fakeFetch(() => new TypeError('Network request failed'));
  await assert.rejects(down.api.computers(), /could not be reached/);
  const outage = fakeFetch(() => ({ status: 502 }));
  await assert.rejects(outage.api.connect(HOST), /having trouble/);
});
