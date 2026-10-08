// Local synthetic transport acceptance only: no production endpoint or user data.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { performance, monitorEventLoopDelay } from 'node:perf_hooks';
import { setTimeout as delay } from 'node:timers/promises';
import WebSocket from 'ws';
import { startRelay } from '../src/main.mjs';
import { signToken } from '../src/tokens.mjs';

const runs = Number(process.env.RUNS ?? 30);
const frames = Number(process.env.FRAMES ?? 32);
const soakSeconds = Number(process.env.SOAK_SECONDS ?? 0);
assert.ok(Number.isInteger(runs) && runs >= 1 && runs <= 10000);
assert.ok(Number.isInteger(frames) && frames >= 2 && frames <= 1024);
assert.ok(Number.isFinite(soakSeconds) && soakSeconds >= 0 && soakSeconds <= 86400);
const secret = 'synthetic-local-benchmark-secret-0123456789';
const hostId = 'c'.repeat(64);
const histogram = monitorEventLoopDelay({ resolution: 20 }); histogram.enable();
const fixedPayloads = Array.from({ length: frames }, (_, index) => {
  const data = Buffer.alloc(16384);
  for (let offset = 0; offset < data.length; offset++) data[offset] = (index * 31 + offset * 17) & 255;
  data.writeUInt32BE(index); return data;
});
const digest = value => createHash('sha256').update(value).digest('hex');
const percentile = (values, p) => [...values].sort((a, b) => a - b)[Math.ceil(values.length * p) - 1];

async function peer(url) {
  const socket = new WebSocket(url); await once(socket, 'open');
  const inbox = []; const waits = [];
  socket.on('message', raw => {
    const value = { message: JSON.parse(raw), at: performance.now() };
    if (waits.length) waits.shift()(value); else inbox.push(value);
  });
  return { socket, send: message => socket.send(JSON.stringify(message)),
    next: () => inbox.length ? Promise.resolve(inbox.shift()) : new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Frame stalled')), 5000);
      waits.push(value => { clearTimeout(timer); resolve(value); });
    }),
  };
}
async function sample(pacing) {
  const relay = startRelay({ VIBYRA_RELAY_SECRET: secret, VIBYRA_RELAY_PREVIEW_PACING_MS: String(pacing) }, false, { authorization: null });
  await new Promise(resolve => relay.server.listen(0, '127.0.0.1', resolve));
  const url = `ws://127.0.0.1:${relay.server.address().port}`;
  let host, phone;
  try {
    host = await peer(url); phone = await peer(url);
    const claims = { hostId, userId: 'synthetic-benchmark', generation: 1, exp: Math.floor(Date.now() / 1000) + 60 };
    host.send({ type: 'host.register', hostId, token: signToken(secret, { ...claims, role: 'host' }) });
    assert.equal((await host.next()).message.previewPacingMs, pacing);
    phone.send({ type: 'client.connect', hostId, token: signToken(secret, { ...claims, role: 'client' }) });
    await host.next(); const clientId = (await phone.next()).message.clientId;
    const payloads = fixedPayloads;
    const expected = digest(Buffer.concat(payloads)); const received = [];
    let markerSent = 0; let markerMs = 0; let maxBuffer = 0; let firstMs = 0;
    const marker = Buffer.from('synthetic terminal marker').toString('base64');
    const started = performance.now();
    const receiving = (async () => {
      for (let index = 0; index < frames + 1; index++) {
        const { message, at } = await phone.next();
        if (message.data === marker) { markerMs = at - markerSent; continue; }
        const data = Buffer.from(message.data, 'base64');
        assert.equal(data.readUInt32BE(), received.length, 'out-of-order or missing frame');
        if (!received.length) firstMs = at - started;
        received.push(data);
      }
    })();
    for (let index = 0; index < frames; index++) {
      if (index === Math.floor(frames / 2)) {
        markerSent = performance.now(); host.send({ type: 'frame', clientId, data: marker });
      }
      host.send({ type: 'frame', clientId, data: payloads[index].toString('base64') });
      maxBuffer = Math.max(maxBuffer, relay.relay.diagnostics().bufferedBytes, host.socket.bufferedAmount);
      await delay(pacing);
    }
    await receiving;
    assert.equal(digest(Buffer.concat(received)), expected, 'payload hash mismatch');
    assert.ok(markerMs >= 0 && markerSent > 0);
    assert.ok(maxBuffer <= 1024 * 1024, 'send buffer bound exceeded');
    return { ms: performance.now() - started, markerMs, firstMs, maxBuffer };
  } finally { host?.socket.terminate(); phone?.socket.terminate(); relay.close(); }
}

const results = {}; const byPacing = { 12: [], 3: [] };
// Paired interleaving reduces order bias; identical deterministic bytes each run.
for (let i = 0; i < runs; i++) {
  for (const pacing of i % 2 === 0 ? [12, 3] : [3, 12]) byPacing[pacing].push(await sample(pacing));
}
for (const pacing of [12, 3]) {
  const samples = byPacing[pacing]; const markers = samples.map(x => x.markerMs);
  results[pacing] = { runs, payloadBytes: frames * 16384,
    medianMs: percentile(samples.map(x => x.ms), .5), p95Ms: percentile(samples.map(x => x.ms), .95),
    markerMinMs: Math.min(...markers), markerMedianMs: percentile(markers, .5), markerP95Ms: percentile(markers, .95), markerMaxMs: Math.max(...markers),
    firstP95Ms: percentile(samples.map(x => x.firstMs), .95),
    maxBufferedBytes: Math.max(...samples.map(x => x.maxBuffer)) };
}
console.log(JSON.stringify({ kind: 'benchmark', scope: 'local-loopback-synthetic-no-Noise-handshake', results }));
const until = performance.now() + soakSeconds * 1000; let cycles = 0; let maxRss = process.memoryUsage().rss;
while (performance.now() < until) {
  await sample(3); cycles++; maxRss = Math.max(maxRss, process.memoryUsage().rss);
  if (cycles % 50 === 0) console.log(JSON.stringify({ kind: 'soak-progress', cycles, maxRss }));
  await delay(Math.min(1000, Math.max(0, until - performance.now())));
}
histogram.disable();
console.log(JSON.stringify({ kind: 'complete', soakSeconds, cycles, maxRss, eventLoopP95Ms: histogram.percentile(95) / 1e6 }));
