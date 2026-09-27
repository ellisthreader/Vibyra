import test from 'node:test';
import assert from 'node:assert/strict';
import { FakeNative, connected } from './httpProxyHarness';
import { HttpProxyController } from '../src/preview/HttpProxyController';
import { decodePreviewBytes, encodePreviewFrame, PREVIEW_CHUNK,
  PREVIEW_WINDOW, type PreviewFrame } from '../src/preview/frameCodec';
import { PreviewOutboundQueue } from '../src/transport/PreviewOutboundQueue';

const pause = () => new Promise(resolve => setTimeout(resolve, 0));
const key = { id: '1', generation: '7' };
const text = new TextEncoder();

test('a native browser request reaches the Mac as Open then Credit through Cloud pacing', async () => {
  const { client, frames } = await connected();
  const native = new FakeNative();
  const controller = new HttpProxyController(client, native, '7');
  await controller.start();
  native.emit('onPreviewRequest', { id: '1', generation: '7', method: 'GET', path: '/', headers: {} });
  const queue = new PreviewOutboundQueue();
  for (const frame of frames()) {
    const raw = Uint8Array.from(atob(encodePreviewFrame(frame)), char => char.charCodeAt(0));
    queue.push(raw, `${frame.key.id}:${frame.key.generation}`,
      frame.kind === 'credit' || frame.kind === 'cancel');
  }
  assert.deepEqual([decodePreviewBytes(queue.pop()!).kind, decodePreviewBytes(queue.pop()!).kind],
    ['open', 'credit']);
  await controller.close(); client.close();
});

test('HTTP Preview streams through Noise frames and grants credit only after native write', async () => {
  const { client, frames, fromMac } = await connected();
  const native = new FakeNative();
  const controller = new HttpProxyController(client, native, '7');
  const bootstrap = await controller.start('/menu?tag=soy');
  assert.equal(new URL(bootstrap).searchParams.get('start'), '/menu?tag=soy');
  native.emit('onPreviewRequest', { id: '1', generation: '7', method: 'GET', path: '/page', headers: {} });
  native.emit('onPreviewEnd', { id: '1', seq: 1 });
  // Response credit leaves with the open, a round trip before the Mac replies.
  assert.deepEqual(frames().map(frame => frame.kind), ['open', 'credit']);
  assert.equal((frames()[1] as Extract<PreviewFrame, { kind: 'credit' }>).total, String(PREVIEW_WINDOW));
  fromMac({ kind: 'credit', key, total: '16384' });
  assert.deepEqual(frames().map(frame => frame.kind), ['open', 'credit', 'data', 'end']);
  const request = JSON.parse(new TextDecoder().decode((frames()[2] as Extract<PreviewFrame,
    { kind: 'data' }>).bytes));
  assert.equal(request.browserOrigin, 'http://127.0.0.1:40000');
  assert.equal(request.path, '/page');
  fromMac({ kind: 'open', key });
  assert.equal(frames().at(-1)?.kind, 'end', 'the Mac\'s open needs no second credit');
  const metadata = text.encode(JSON.stringify({ v: 1, status: 200,
    headers: { 'content-type': 'text/plain' }, setCookies: ['a=1; Path=/', 'b=2; Path=/'] }));
  fromMac({ kind: 'data', key, sequence: 0, bytes: metadata });
  await pause();
  assert.ok(native.calls.includes('start:1:200:2'));
  const grantedAfterHeaders = frames().filter(frame => frame.kind === 'credit').length;
  let release!: () => void;
  native.holdData = new Promise(resolve => { release = resolve; });
  fromMac({ kind: 'data', key, sequence: 1, bytes: text.encode('fresh') });
  await pause();
  assert.ok(native.calls.includes('data:1:fresh'));
  assert.equal(frames().filter(frame => frame.kind === 'credit').length, grantedAfterHeaders);
  release();
  await pause();
  assert.equal(frames().filter(frame => frame.kind === 'credit').length, grantedAfterHeaders);
  const chunk = new Uint8Array(PREVIEW_CHUNK).fill(97);
  fromMac({ kind: 'data', key, sequence: 2, bytes: chunk });
  fromMac({ kind: 'data', key, sequence: 3, bytes: chunk });
  await pause();
  assert.equal(frames().filter(frame => frame.kind === 'credit').length, grantedAfterHeaders + 1);
  fromMac({ kind: 'end', key, sequence: 4 });
  await pause();
  assert.ok(native.calls.includes('end:1'));
  await controller.close(); client.close();
});

test('bad Preview frames cancel only Preview, leaving terminal RPC live', async () => {
  const { client, frames, fromMac } = await connected();
  const native = new FakeNative();
  const controller = new HttpProxyController(client, native, '7');
  await controller.start();
  native.emit('onPreviewRequest', { id: '1', generation: '7', method: 'GET', path: '/', headers: {} });
  fromMac({ kind: 'cancel', key });
  await pause();
  assert.ok(native.calls.includes('cancel:1'));
  assert.deepEqual(frames().map(frame => frame.kind), ['open', 'credit']);
  assert.throws(() => client.sendPreviewFrame('VlAB'), /Invalid Preview frame/);
  await controller.close(); client.close();
});

test('WebSocket upgrade keeps request duplex and grants native reads only within Mac credit', async () => {
  const { client, frames, fromMac } = await connected();
  const native = new FakeNative();
  const controller = new HttpProxyController(client, native, '7');
  await controller.start();
  native.emit('onPreviewRequest', { id: '1', generation: '7', kind: 'upgrade', method: 'GET',
    path: '/hmr', headers: { upgrade: 'websocket' } });
  assert.deepEqual(frames().map(frame => frame.kind), ['open', 'credit']);
  fromMac({ kind: 'credit', key, total: '16384' });
  const sent = frames();
  assert.deepEqual(sent.map(frame => frame.kind), ['open', 'credit', 'data']);
  assert.equal(JSON.parse(new TextDecoder().decode((sent[2] as Extract<PreviewFrame, { kind: 'data' }>).bytes)).kind, 'upgrade');
  const metadataBytes = (sent[2] as Extract<PreviewFrame, { kind: 'data' }>).bytes.length;
  await pause();
  assert.ok(native.calls.includes(`read:1:${16384 - metadataBytes}`));
  native.emit('onPreviewBody', { id: '1', seq: 1, dataBase64: btoa('ws-frame') });
  assert.equal(frames().at(-1)?.kind, 'data');
  fromMac({ kind: 'open', key });
  fromMac({ kind: 'data', key, sequence: 0,
    bytes: text.encode(JSON.stringify({ v: 1, status: 101, headers: { upgrade: 'websocket' } })) });
  fromMac({ kind: 'data', key, sequence: 1, bytes: text.encode('ws-response') });
  await pause();
  assert.ok(native.calls.includes('start:1:101:0'));
  assert.ok(native.calls.includes('data:1:ws-response'));
  native.emit('onPreviewEnd', { id: '1', seq: 2 });
  assert.equal(frames().at(-1)?.kind, 'end');
  await controller.close(); client.close();
});

test('a ninth browser asset can open while eight completed sockets cross the JS bridge', async () => {
  const { client, frames } = await connected();
  const native = new FakeNative();
  const controller = new HttpProxyController(client, native, '7');
  await controller.start();
  for (let id = 1; id <= 9; id++) {
    native.emit('onPreviewRequest', { id: String(id), generation: '7', method: 'GET', path: `/asset-${id}`, headers: {} });
  }
  assert.equal(frames().filter(frame => frame.kind === 'open').length, 9);
  assert.equal(native.calls.some(call => call.startsWith('cancel:')), false);
  await controller.close(); client.close();
});

test('a 80 KiB form body waits for Mac credit instead of being canceled', async () => {
  const { client, frames, fromMac } = await connected();
  const native = new FakeNative();
  const controller = new HttpProxyController(client, native, '7');
  await controller.start();
  native.emit('onPreviewRequest', { id: '1', generation: '7', method: 'POST', path: '/form', headers: {} });
  for (let seq = 1; seq <= 5; seq++) {
    native.emit('onPreviewBody', { id: '1', seq, dataBase64: btoa('x'.repeat(PREVIEW_CHUNK)) });
  }
  native.emit('onPreviewEnd', { id: '1', seq: 6 });
  assert.deepEqual(frames().map(frame => frame.kind), ['open', 'credit']);
  fromMac({ kind: 'credit', key, total: String(PREVIEW_WINDOW) });
  for (let step = 1; step <= 5; step++) {
    fromMac({ kind: 'credit', key, total: String(PREVIEW_WINDOW + step * PREVIEW_CHUNK) });
  }
  assert.equal(frames().filter(frame => frame.kind === 'data').length, 6);
  assert.equal(frames().at(-1)?.kind, 'end');
  assert.equal(native.calls.some(call => call.startsWith('cancel:')), false);
  await controller.close(); client.close();
});

test('a Mac that takes a larger window gets it granted with the open', async () => {
  const { client, frames, fromMac } = await connected();
  const native = new FakeNative();
  const controller = new HttpProxyController(client, native, '7', 1024 * 1024);
  await controller.start();
  native.emit('onPreviewRequest', { id: '1', generation: '7', method: 'GET', path: '/menu', headers: {} });
  native.emit('onPreviewEnd', { id: '1', seq: 1 });
  assert.equal((frames()[1] as Extract<PreviewFrame, { kind: 'credit' }>).total, String(1024 * 1024));
  fromMac({ kind: 'credit', key, total: '16384' });
  fromMac({ kind: 'open', key });
  fromMac({ kind: 'data', key, sequence: 0, bytes: text.encode(JSON.stringify({ v: 1, status: 200, headers: {} })) });
  // Twenty full chunks arrive without waiting for any further credit.
  for (let sequence = 1; sequence <= 20; sequence++)
    fromMac({ kind: 'data', key, sequence, bytes: new Uint8Array(PREVIEW_CHUNK).fill(97) });
  fromMac({ kind: 'end', key, sequence: 21 });
  for (let i = 0; i < 60; i++) await pause();
  assert.ok(native.calls.includes('end:1'));
  assert.equal(native.calls.some(call => call.startsWith('cancel:')), false);
  await controller.close(); client.close();
});
