import assert from 'node:assert/strict';
import test from 'node:test';
import { VibesError, createVibesApi } from '../src/vibes/api';
import { VibesStore } from '../src/vibes/VibesStore';
import type { VibesApi } from '../src/vibes/types';

const wallet = { version: 1 as const, available: 3, held: 0, total: 3, paidAvailable: 0, plan: 'free', paidUntil: null,
  trialChatsRemaining: 2, trialCredits: 3, trialChats: 2, trialChatCredits: 3, accountToken: 'wallet', consented: false,
  verified: false, guest: true, purchasesEnabled: false, products: [], entitlements: { maxProjects: 1, concurrentReplies: 1,
    fullCatalogue: false, remoteAccess: false, sessionCredits: 60, weekCredits: 150 }, planEntitlements: {},
  remoteAccessLive: false, usedProjects: 0, limits: null };

/** A server answering the way a real one does when it is not JSON that comes back. */
const responder = (status: number, body: string, type = 'text/html') =>
  (async () => new Response(body, { status, headers: { 'Content-Type': type } })) as unknown as typeof fetch;

test('a server without the Vibes routes is reported as that, not as a lost connection', async () => {
  const api = createVibesApi('https://api.test', () => 'token',
    responder(405, '<!DOCTYPE html><title>An Error Occurred: Method Not Allowed</title>'));
  const error = await api.wallet().then(() => null, (e: unknown) => e);
  assert.ok(error instanceof VibesError);
  // The status is what the store reads to tell an answer apart from silence.
  assert.equal(error.status, 405);
  assert.match(error.message, /not available on this server yet/);
});

// Production's answer, verbatim, on 2026-09-11: it has no Vibes routes, and Laravel
// said so in JSON. That sentence reached the phone chat as the error.
test('a missing route answering in JSON never shows the framework sentence', async () => {
  const laravel = JSON.stringify({ message: 'The POST method is not supported for route api/vibes/guest. Supported methods: OPTIONS.' });
  const api = createVibesApi('https://api.test', () => null, responder(405, laravel, 'application/json'));
  const error = await api.guest!.create('install-one').then(() => null, (e: unknown) => e);
  assert.ok(error instanceof VibesError);
  assert.equal(error.status, 405);
  assert.equal(error.message, 'Vibyra AI is not available on this server yet.');
  // A 404 the Vibes endpoints explained themselves keeps their words.
  const gone = createVibesApi('https://api.test', () => 'token',
    responder(404, JSON.stringify({ error: 'That chat has been deleted.' }), 'application/json'));
  assert.equal((await gone.wallet().then(() => null, (e: unknown) => e) as VibesError).message, 'That chat has been deleted.');
});

test('an HTML error page keeps its status, so an authoritative rejection still settles the send', async () => {
  // A proxy in front of the backend answers 402 with its own page; the phone must
  // still release the draft rather than hold a pending request that never existed.
  const api = createVibesApi('https://api.test', () => 'token',
    responder(402, '<html><body>Payment Required</body></html>'));
  const submitted = { ...api, submit: api.submit } as VibesApi;
  const store = new VibesStore(submitted, () => 'request-one',
    { read: async () => null, write: async () => {} });
  store.update({ ready: true });
  assert.equal(await store.send('quote'), false);
  assert.equal(store.state.pending, null, 'A rejection the server explained does not wedge the composer');
});

test('a JSON error keeps the wording the server chose', async () => {
  const api = createVibesApi('https://api.test', () => 'token',
    responder(402, JSON.stringify({ error: 'Upgrade to keep chatting.' }), 'application/json'));
  const error = await api.wallet().then(() => null, (e: unknown) => e);
  assert.ok(error instanceof VibesError);
  assert.equal(error.status, 402);
  assert.equal(error.message, 'Upgrade to keep chatting.');
});

test('a genuinely lost connection is still status 0, so the request is never assumed rejected', async () => {
  const api = createVibesApi('https://api.test', () => 'token',
    (async () => { throw new TypeError('Failed to fetch'); }) as unknown as typeof fetch);
  const error = await api.wallet().then(() => null, (e: unknown) => e);
  assert.ok(error instanceof VibesError);
  assert.equal(error.status, 0);
  assert.match(error.message, /Your draft is safe/);
});

test('guest bootstrap mints a bearer session that every later Vibes route reuses', async () => {
  const requests: RequestInit[] = [];
  const fetcher = (async (input: string | URL | Request, init?: RequestInit) => {
    requests.push(init ?? {});
    const body = String(input).endsWith('/guest') ? { token: 'guest-token', wallet } : { wallet };
    return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }) as typeof fetch;
  const api = createVibesApi('https://api.test', () => null, fetcher);
  const session = await api.guest!.create('install-one');
  assert.equal(session.token, 'guest-token');
  assert.equal((requests[0].headers as Record<string, string>).Authorization, undefined);
  await api.wallet();
  assert.equal((requests[1].headers as Record<string, string>).Authorization, 'Bearer guest-token');
});

test('successful HTTP with missing chat, turn or model data is rejected at the API boundary', async () => {
  const api = createVibesApi('https://api.test', () => 'token', responder(200, '{}', 'application/json'));
  for (const read of [() => api.chats(), () => api.turns('chat-one'), () => api.models()]) {
    await assert.rejects(read(), /unexpected response/);
  }
});
