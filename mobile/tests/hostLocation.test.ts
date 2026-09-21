import test from 'node:test';
import assert from 'node:assert/strict';
import { ipOf, lookUp, placeOf } from '../src/ui/hostLocation';

test('a lookup reply becomes a city and country, or the country alone', () => {
  assert.equal(placeOf({ city: 'Manchester', region: 'England', country: 'United Kingdom' }), 'Manchester, United Kingdom');
  assert.equal(placeOf({ city: ' ', country: 'United States' }), 'United States');
  // A private or shared address comes back with neither: that is not a place.
  assert.equal(placeOf({ ip: '192.168.1.24', organization_name: 'Unknown' }), null);
  assert.equal(placeOf({ city: 'Somewhere' }), null);
  assert.equal(placeOf(null), null);
});

test('the public IP in a reply is kept only when it is shaped like one', () => {
  assert.equal(ipOf({ ip: '86.12.34.56' }), '86.12.34.56');
  assert.equal(ipOf({ ip: '2a00:23ee:2648:5946:6da1:3d15:e37f:100d' }), '2a00:23ee:2648:5946:6da1:3d15:e37f:100d');
  assert.equal(ipOf({ ip: '<script>' }), null);
  assert.equal(ipOf({ ip: 42 }), null);
  assert.equal(ipOf({}), null);
});

test('the phone asks about itself for a computer on its network, and about the computer otherwise', async () => {
  const asked: string[] = [];
  const reply = (body: unknown, status = 200) => async (url: string | URL | Request) => {
    asked.push(String(url));
    return new Response(JSON.stringify(body), { status });
  };
  const seen = { ip: '86.12.34.56', city: 'Manchester', country: 'United Kingdom' };
  const found = { place: 'Manchester, United Kingdom', ip: '86.12.34.56' };
  assert.deepEqual(await lookUp('192.168.1.24:4318', reply(seen)), found);
  assert.deepEqual(await lookUp('203.0.113.7:4318', reply(seen)), found);
  assert.deepEqual(asked, ['https://get.geojs.io/v1/ip/geo.json', 'https://get.geojs.io/v1/ip/geo/203.0.113.7.json']);
  // A computer on this very device is asked about as this device: its public
  // IP is the only real address the phone can name for it.
  assert.deepEqual(await lookUp('[::1]:4319', reply(seen)), found);
  assert.equal(asked.at(-1), 'https://get.geojs.io/v1/ip/geo.json');
  // A name is never sent anywhere, and a service that fails or throws says nothing.
  const before = asked.length;
  assert.equal(await lookUp('studio.example.com:4318', reply(seen)), null);
  assert.equal(asked.length, before);
  assert.equal(await lookUp('192.168.1.24:4318', reply(seen, 503)), null);
  assert.equal(await lookUp('192.168.1.24:4318', reply({ organization_name: 'Unknown' })), null);
  assert.equal(await lookUp('192.168.1.24:4318', async () => { throw new TypeError('offline'); }), null);
});
