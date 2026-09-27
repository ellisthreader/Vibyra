import test from 'node:test';
import assert from 'node:assert/strict';
import { confirmedComputer } from '../src/connection/confirmation';

const key = 'ab'.repeat(32);
const found = { id: key, name: 'Studio PC', hostId: key, host: '192.168.1.4', port: 4319 };

test('a confirmed computer stays visible through browse and address gaps', () => {
  assert.deepEqual(confirmedComputer(null, [found], found), found);
  assert.deepEqual(confirmedComputer(found, [], null), found);
  assert.deepEqual(confirmedComputer(found, [{ id: key, name: found.name, hostId: key }], null), found);
});

test('the pinned identity uses its newest usable endpoint even when another computer appears', () => {
  const moved = { ...found, host: '192.168.1.9' };
  const other = { ...found, id: 'cd'.repeat(32), hostId: 'cd'.repeat(32), name: 'Other PC' };
  assert.deepEqual(confirmedComputer(found, [other, moved], null), moved);
  assert.deepEqual(confirmedComputer(found, [other], null), found);
});
