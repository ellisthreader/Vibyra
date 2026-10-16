import assert from 'node:assert/strict';
import test from 'node:test';
import { createAuthorization } from '../src/authorization.mjs';
import { createAdmission } from '../src/admission.mjs';
import { createReporter } from '../src/presence.mjs';
import { startRelay, readJson } from '../src/main.mjs';
import { PassThrough } from 'node:stream';

const settle = () => new Promise(resolve => setImmediate(resolve));
test('authoritative admission rejects revoked token including after restart', async () => {
  for (let i = 0; i < 2; i++) {
    const auth = createAuthorization({ apiUrl: 'https://test', secret: 'test', fetchImpl: async () => ({ ok: true, json: async () => ({ ok: true, allowed: false }) }) });
    assert.equal(await auth.admit('signed-but-revoked'), null); auth.close();
  }
});
test('authorization service is required unless explicitly injected for fixtures', async () => {
  const auth = createAuthorization({}); assert.equal(await auth.admit('token'), null); auth.close();
  assert.throws(() => startRelay({ VIBYRA_RELAY_REPLICAS: '2' }, false), /exactly one/);
});
test('failed renewals close at authorization bound; membership is separate', async () => {
  let time = 0; let closed = 0; const calls = [];
  const auth = createAuthorization({ apiUrl: 'https://test', secret: 'test', now: () => time,
    fetchImpl: async (_url, request) => {
      const body = JSON.parse(request.body); calls.push(body);
      if (body.renewal) throw new Error('offline');
      return { ok: true, json: async () => ({ ok: true, allowed: true }) };
    } });
  const id = await auth.admit('token'); auth.bind(id, () => closed++);
  time = 60000; await auth.tick(); await settle(); assert.equal(closed, 0);
  time = 179999; await auth.tick(); await settle(); assert.equal(closed, 0);
  time = 180000; await auth.tick(); assert.equal(closed, 1);
  assert.equal(calls[0].renewal, false); assert.equal(calls[1].renewal, true); auth.close();
});
test('late renewal cannot revive an expired authorization lease', async () => {
  let time = 0; let answer; let closed = 0;
  const auth = createAuthorization({ apiUrl: 'https://test', secret: 'test', now: () => time,
    fetchImpl: async (_url, req) => {
      if (JSON.parse(req.body).renewal) await new Promise(r => { answer = r; });
      return { ok: true, json: async () => ({ ok: true, allowed: true }) };
    } });
  const id = await auth.admit('token'); auth.bind(id, () => closed++);
  time = 60000; await auth.tick(); time = 180000; await auth.tick();
  answer(); await settle(); assert.equal(closed, 1); auth.close();
});
test('admission ignores spoofed forwarded IP and bounds attempts', () => {
  let time = 0; const gate = createAdmission({ now: () => time, attemptsPerMinute: 2 });
  const req = { socket: { remoteAddress: 'proxy' }, headers: { 'x-forwarded-for': 'one' } };
  assert.equal(gate.accept(req), true); req.headers['x-forwarded-for'] = 'two';
  assert.equal(gate.accept(req), true); assert.equal(gate.accept(req), false);
  time = 60000; assert.equal(gate.accept(req), true);
});
test('old-account session end cannot decrement current-account presence', () => {
  const reporter = createReporter({});
  reporter.hostOnline('host', 'old'); reporter.sessionStarted('host', 'old', 'a', 'a');
  reporter.hostOffline('host', 'old'); reporter.hostOnline('host', 'new');
  reporter.sessionStarted('host', 'new', 'b', 'b'); reporter.sessionEnded('host', 'old', 'a', 'a');
  assert.equal(reporter.presence()[0].clients, 1);
});
test('admin body bytes are bounded and listeners removed on rejection', async () => {
  const req = new PassThrough(); const parsed = readJson(req);
  req.write(Buffer.alloc(4097)); await assert.rejects(parsed, /Too large/);
  assert.equal(req.listenerCount('data'), 0); req.end();
});
