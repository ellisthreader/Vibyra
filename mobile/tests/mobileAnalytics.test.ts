import assert from 'node:assert/strict';
import test from 'node:test';
import { createMobileAnalytics } from '../src/analytics/mobileAnalytics';
import type { ConsentStorage } from '../src/analytics/mobileConsent';

const tick = () => new Promise<void>(resolve => setImmediate(resolve));
const storage = (): ConsentStorage => {
  const flags = new Map<string, string>();
  return { read: async key => flags.get(key) ?? null, write: async (key, value) => { flags.set(key, value); } };
};

test('unknown and declined choices never send optional events; acceptance requires server confirmation', async () => {
  const requests: { url: string; init: RequestInit }[] = [];
  const fetcher = async (url: string | URL | Request, init?: RequestInit) => {
    requests.push({ url: String(url), init: init! });
    return String(url).endsWith('/events')
      ? new Response('{}', { status: 202 })
      : new Response(JSON.stringify({ choice: 'aggregate' }), { status: 200 });
  };
  const analytics = createMobileAnalytics('https://example.test/', async () => 'secret', () => 'event-1', fetcher as typeof fetch, Date.now, storage());
  await analytics.refresh('guest');
  await analytics.track({ event: 'mobile_chat_prompt_sent', properties: { model: 'openai/gpt', effort: 'high' } });
  assert.equal(requests.length, 0);
  await analytics.choose('declined');
  await analytics.track({ event: 'mobile_chat_prompt_sent', properties: {} });
  assert.equal(requests.filter(request => request.url.endsWith('/events')).length, 0);
  await analytics.choose('aggregate');
  await analytics.track({ event: 'mobile_chat_prompt_sent', properties: { model: 'openai/gpt', effort: 'high' } });
  await tick();
  const sent = requests.find(request => request.url.endsWith('/events'));
  assert.ok(sent);
  assert.equal((sent.init.headers as Record<string, string>).Authorization, 'Bearer secret');
  const body = JSON.parse(sent.init.body as string);
  assert.deepEqual({ ...body, occurred_at: 'time' }, {
    event: 'mobile_chat_prompt_sent', properties: { model: 'openai/gpt', effort: 'high' },
    surface: 'mobile', consent_mode: 'aggregate', event_id: 'event-1', occurred_at: 'time',
  });
});

test('a local aggregate choice keeps events unlinked when server consent is linked', async () => {
  const bodies: Record<string, unknown>[] = [];
  const fetcher = async (url: string | URL | Request, init?: RequestInit) => {
    if (String(url).endsWith('/events')) {
      bodies.push(JSON.parse(init!.body as string));
      return new Response('{}', { status: 202 });
    }
    return new Response(JSON.stringify({ choice: init?.method === 'PUT' ? JSON.parse(init.body as string).choice : 'linked' }), { status: 200 });
  };
  const analytics = createMobileAnalytics('https://example.test', async () => 'secret', () => 'event-2', fetcher as typeof fetch, Date.now, storage());
  await analytics.refresh('person@example.test');
  await analytics.choose('aggregate');
  await analytics.refresh('person@example.test');
  await analytics.track({ event: 'mobile_preview_opened', properties: {} });
  await tick();
  assert.equal(bodies.length, 1);
  assert.equal(bodies[0]?.consent_mode, 'aggregate');
});

test('server refusal keeps analytics disabled even when the person taps Allow', async () => {
  let events = 0;
  const fetcher = async (url: string | URL | Request) => {
    if (String(url).endsWith('/events')) events++;
    return new Response(JSON.stringify({ choice: 'declined' }), { status: 200 });
  };
  const analytics = createMobileAnalytics('https://example.test', async () => 'secret', () => 'id', fetcher as typeof fetch, Date.now, storage());
  await analytics.refresh('guest');
  assert.equal(await analytics.choose('aggregate'), false);
  assert.equal(analytics.snapshot().choice, 'unknown');
  await analytics.opened({ platform: 'ios' });
  assert.equal(events, 0);
});

test('transient failure retains one event id; declining purges the pending queue', async () => {
  const bodies: string[] = [];
  let fail = true;
  const fetcher = async (url: string | URL | Request, init?: RequestInit) => {
    if (String(url).endsWith('/events')) {
      bodies.push(init!.body as string);
      return new Response('{}', { status: fail ? 503 : 202 });
    }
    return new Response(JSON.stringify({ choice: JSON.parse(init?.body as string || '{}').choice ?? 'aggregate' }), { status: 200 });
  };
  const analytics = createMobileAnalytics('https://example.test', async () => 'secret', () => 'same-id', fetcher as typeof fetch, Date.now, storage());
  await analytics.refresh('guest');
  await analytics.choose('aggregate');
  await analytics.track({ event: 'mobile_preview_opened', properties: {} });
  await tick();
  assert.equal(bodies.length, 1);
  fail = false;
  await analytics.refresh('guest');
  await tick();
  assert.equal(bodies.length, 2);
  assert.equal(bodies[0], bodies[1]);
  await analytics.track({ event: 'mobile_preview_opened', properties: {} });
  await analytics.choose('declined');
  await tick();
  const count = bodies.length;
  await analytics.refresh('guest');
  await tick();
  assert.equal(bodies.length, count);
});

test('changing account scope blocks events until this device and the server agree', async () => {
  let identity = 'first';
  let events = 0;
  const fetcher = async (url: string | URL | Request, init?: RequestInit) => {
    if (String(url).endsWith('/events')) events++;
    return new Response(JSON.stringify({ choice: JSON.parse(init?.body as string || '{}').choice ?? 'aggregate' }), { status: 200 });
  };
  const analytics = createMobileAnalytics('https://example.test', async () => identity, () => 'id', fetcher as typeof fetch, Date.now, storage());
  await analytics.refresh('first@example.test');
  await analytics.choose('aggregate');
  identity = 'second';
  await analytics.track({ event: 'mobile_preview_opened', properties: {} });
  await analytics.refresh('second@example.test');
  await analytics.track({ event: 'mobile_preview_opened', properties: {} });
  await tick();
  assert.equal(events, 0);
});

test('offline decline stays local and retries server withdrawal after reconnect', async () => {
  let online = false;
  let withdrawals = 0;
  const fetcher = async (_url: string | URL | Request, init?: RequestInit) => {
    const choice = JSON.parse(init?.body as string || '{}').choice;
    if (choice === 'declined') {
      withdrawals++;
      if (!online) throw new Error('offline');
    }
    return new Response(JSON.stringify({ choice: choice ?? 'unknown' }), { status: 200 });
  };
  const analytics = createMobileAnalytics('https://example.test', async () => 'secret', () => 'id', fetcher as typeof fetch, Date.now, storage());
  await analytics.refresh('guest');
  await analytics.choose('declined');
  await tick();
  assert.equal(analytics.snapshot().choice, 'declined');
  assert.equal(withdrawals, 1);
  online = true;
  await analytics.refresh('guest');
  await tick();
  assert.equal(withdrawals, 2);
});
