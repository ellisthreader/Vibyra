import test from 'node:test';
import assert from 'node:assert/strict';
import { decidePairLink, pairHostLabel } from '../src/state/pairLinkDecision';
import { acceptPairLink, receivePairLink, type HeldPairLink } from '../src/state/pairLink';
import { delay, hostState, pairing, runtimeHarness } from './runtimeHarness';

/** F-29: a `vibyra://pair` link that arrives from outside the app must not silently switch computers. */
const link = (value: object) => 'vibyra://pair?data=' + Buffer.from(JSON.stringify(value)).toString('base64url');
const other = { ...pairing, hostId: 'host2', name: 'Attacker Mac', publicKey: 'cd'.repeat(32) };
const opens = (sent: any[]) => sent.filter(item => item.type === 'open');

async function pairedTo(host = pairing) {
  const h = runtimeHarness();
  await h.store.actions.connect(JSON.stringify(host));
  assert.equal(h.store.state.status, 'connected');
  return h;
}

test('only a link for the computer this phone already holds may connect at once', () => {
  const current = { hostId: 'host1', publicKey: 'ab'.repeat(32) };
  assert.equal(decidePairLink(current, current), 'pair');
  assert.equal(decidePairLink(current, { hostId: 'host2', publicKey: 'cd'.repeat(32) }), 'confirm');
  assert.equal(decidePairLink(current, { hostId: 'host1', publicKey: 'cd'.repeat(32) }), 'confirm', 'same id, other key');
  assert.equal(decidePairLink(current, { hostId: 'host2', publicKey: 'ab'.repeat(32) }), 'confirm', 'same key, other id');
  assert.equal(decidePairLink(null, current), 'confirm', 'a first pairing from a link is also a tap');
  assert.equal(decidePairLink(undefined, current), 'confirm');
});

test('a host name is shown as short plain text', () => {
  assert.equal(pairHostLabel('Ellis’s Mac'), 'Ellis’s Mac');
  assert.equal(pairHostLabel('  Work\n\tMac   Studio  '), 'Work Mac Studio');
  assert.equal(pairHostLabel('Mac‮gpj.exe⁦'), 'Macgpj.exe', 'direction overrides and control characters are dropped');
  assert.equal(pairHostLabel('x'.repeat(100)), `${'x'.repeat(39)}…`);
  assert.equal(pairHostLabel(' \n '), 'Unnamed computer');
});

test('a link for a different computer is held: nothing is cleared, opened or saved until Pair is tapped', async () => {
  const h = await pairedTo();
  const before = { projects: h.store.state.projects, saved: h.memory.get('connection'), opened: opens(h.sent).length };
  const held: HeldPairLink[] = [];
  await receivePairLink(h.store, link(other), next => held.push(next));
  await delay(10);
  assert.deepEqual(held.map(item => item.name), ['Attacker Mac']);
  assert.equal(opens(h.sent).length, before.opened, 'no connection was opened');
  assert.equal(h.store.state.status, 'connected', 'still connected to the current computer');
  assert.equal(h.store.saved?.pairing.hostId, 'host1');
  assert.equal(h.memory.get('connection'), before.saved, 'the saved pairing is untouched');
  assert.equal(h.store.state.projects, before.projects, 'the session and project list were not cleared');
  assert.equal(h.store.state.error, null);
});

test('cancelling a held link leaves the connection and session exactly as they were', async () => {
  const h = await pairedTo();
  const projects = h.store.state.projects, opened = opens(h.sent).length;
  const held: HeldPairLink[] = [];
  await receivePairLink(h.store, link(other), next => held.push(next));
  assert.equal(held.length, 1);
  held.pop(); // Cancel: the held link is dropped and never handed to `acceptPairLink`.
  await delay(10);
  assert.equal(h.store.state.status, 'connected');
  assert.equal(h.store.state.projects, projects);
  assert.equal(opens(h.sent).length, opened);
  assert.equal(h.store.saved?.pairing.hostId, 'host1');
});

test('tapping Pair connects with exactly the held link and then switches computers', async () => {
  const h = await pairedTo();
  h.handle(message => {
    if (message.type === 'send' && message.payload.method === 'host.state') {
      h.reply(message, { ...structuredClone(hostState), host: { ...hostState.host, id: 'host2', name: 'Attacker Mac' } });
      return true;
    }
    return false;
  });
  let held: HeldPairLink | null = null;
  await receivePairLink(h.store, link(other), next => { held = next; });
  assert.ok(held);
  await acceptPairLink(h.store, held!);
  assert.equal(h.store.saved?.pairing.hostId, 'host2');
  assert.equal(h.store.state.status, 'connected');
  assert.equal(opens(h.sent).at(-1).pairing.publicKey, 'cd'.repeat(32));
});

test('a link for the computer already paired connects without a tap and holds nothing', async () => {
  const h = await pairedTo();
  const opened = opens(h.sent).length, held: HeldPairLink[] = [];
  await receivePairLink(h.store, link({ ...pairing, invite: 'cd'.repeat(32) }), next => held.push(next));
  assert.deepEqual(held, []);
  assert.equal(opens(h.sent).length, opened + 1, 'reconnected to the same computer');
  assert.equal(h.store.saved?.pairing.hostId, 'host1');
});

test('a first pairing from a link is held for a tap too', async () => {
  const h = runtimeHarness();
  const held: HeldPairLink[] = [];
  await receivePairLink(h.store, link(pairing), next => held.push(next));
  assert.equal(held.length, 1);
  assert.equal(held[0]!.name, 'Test computer');
  assert.equal(opens(h.sent).length, 0);
  assert.equal(h.store.saved, null);
  assert.equal(h.memory.has('connection'), false);
});

test('a link that is not a pairing code reports its error and holds nothing', async () => {
  const h = await pairedTo();
  const held: HeldPairLink[] = [], opened = opens(h.sent).length;
  await receivePairLink(h.store, 'vibyra://pair?data=not-a-code', next => held.push(next));
  await receivePairLink(h.store, link({ ...other, url: 'https://example.com' }), next => held.push(next));
  assert.deepEqual(held, []);
  assert.equal(opens(h.sent).length, opened);
  assert.match(String(h.store.state.error), /pairing code|connection address/);
  assert.equal(h.store.saved?.pairing.hostId, 'host1');
});
