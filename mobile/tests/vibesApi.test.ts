import assert from 'node:assert/strict';
import test from 'node:test';
import { VibesError, createVibesApi } from '../src/vibes/api';
import { VibesStore } from '../src/vibes/VibesStore';
import type { VibesApi } from '../src/vibes/types';

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
