import test from 'node:test';
import assert from 'node:assert/strict';
import { RpcClient, RpcError } from '../src/transport/RpcClient';
import { CreateRequests } from '../src/state/createRequest';
const pairing = { version: 1 as const, hostId: 'h1', name: 'Computer', publicKey: 'ab'.repeat(32), url: 'ws://localhost:4318' };
async function harness() {
  let next = 0; const sent: any[] = [];
  const client = new RpcClient(message => sent.push(message), () => String(++next));
  client.receive({ type: 'ready' });
  const opened = client.open(pairing, 'cd'.repeat(32));
  await Promise.resolve();
  const connectionId = sent.at(-1).connectionId;
  client.receive({ type: 'connected', connectionId }); await opened;
  return { client, sent, connectionId };
}
test('disconnected terminal input is uncertain and never retried', async () => {
  const { client, sent } = await harness();
  const pending = client.request('session.input', { data: 'run\r' });
  client.close();
  await assert.rejects(pending, (error: RpcError) => error.uncertain && /delivery is uncertain/.test(error.message));
  assert.equal(sent.filter(item => item.payload?.method === 'session.input').length, 1);
});
test('stale connection notices cannot complete requests on a different computer', async () => {
  const { client, sent } = await harness();
  const pending = client.request('host.state'); const id = sent.at(-1).payload.id;
  client.receive({ type: 'message', connectionId: 'old-host', payload: { id, ok: true, result: 'wrong' } });
  client.receive({ type: 'message', connectionId: sent.at(-1).connectionId, payload: { id, ok: true, result: 'correct' } });
  assert.equal(await pending, 'correct'); client.close();
});
test('session creation keeps its idempotency token only for uncertain outcomes', () => {
  let n = 0; const creates = new CreateRequests(() => String(++n));
  const key = creates.key('host1', 'project1', 'shell', 'Task');
  assert.equal(creates.begin(key), '1');
  creates.failed(key, new RpcError('Timed out', true));
  assert.equal(creates.begin(key), '1');
  creates.failed(key, new RpcError('Invalid project', false));
  assert.equal(creates.begin(key), '2');
  creates.success(key); assert.equal(creates.begin(key), '3');
  assert.equal(creates.begin(creates.key('host2', 'project1', 'shell', 'Task')), '4');
});
test('authoritative host rejection carries a definitive outcome', async () => {
  const { client, sent, connectionId } = await harness();
  const pending = client.request('session.create');
  client.receive({ type: 'message', connectionId, payload: { id: sent.at(-1).payload.id, ok: false,
    error: { code: 'REQUEST_REJECTED', message: 'Project not allowed' } } });
  await assert.rejects(pending, (error: RpcError) => !error.uncertain && error.code === 'REQUEST_REJECTED');
  client.close();
});
