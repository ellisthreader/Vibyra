import test from 'node:test';
import assert from 'node:assert/strict';
import { parsePairing } from '../src/transport/pairing';
const base = { version: 1, hostId: 'mac', name: 'Mac', publicKey: 'a'.repeat(64), route: 'direct' };
const parse = (url: string, network?: string, route = 'direct') => parsePairing(JSON.stringify({ ...base, url, network, route }));
test('IPv6 LAN invitations retain their explicit scope and bracketed endpoint', () => {
  const result = parse('ws://[2001:db8:1234:5678::10]:4319', 'lan');
  assert.equal(result.network, 'lan');
  assert.equal(result.url, 'ws://[2001:db8:1234:5678::10]:4319');
  assert.equal(parse('ws://[fd12:3456::10]:4319', 'lan').network, 'lan');
  assert.ok(parse('ws://100.100.0.10:4319'));
});
test('LAN scope never permits public IPv4, relay, DNS or unsafe IPv6 endpoints', () => {
  for (const url of ['ws://8.8.8.8:4319', 'ws://example.com:4319', 'ws://[::ffff:192.168.1.2]:4319',
    'ws://[ff02::1]:4319', 'ws://[::]:4319', 'ws://192.0.0.2:4319']) assert.throws(() => parse(url, 'lan'));
  assert.throws(() => parse('ws://[2001:db8::10]:4319'));
  assert.throws(() => parse('ws://[2001:db8::10]:4319', 'lan', 'relay'));
  assert.throws(() => parse('ws://[2001:db8::10]:4319', 'internet'));
  assert.ok(parse('wss://example.com'));
});
