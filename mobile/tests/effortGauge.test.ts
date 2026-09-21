import assert from 'node:assert/strict';
import test from 'node:test';
import { appendWords } from '../src/vibes/appendWords';
import { positionAt, rungAt, stopAt } from '../src/vibes/gaugeGeometry';

// Six rungs on a 260pt track, inset 10pt at each end: a stop every 48pt.
const length = 260, count = 6, inset = 10;

test('the ladder runs left to right, cheapest first, evenly and never past the thumb inset', () => {
  assert.equal(stopAt(0, length, count, inset), 10);
  assert.equal(stopAt(count - 1, length, count, inset), 250);
  assert.equal(stopAt(3, length, count, inset) - stopAt(2, length, count, inset), 48);
  assert.equal(stopAt(0, length, 1, inset), 130, 'a single rung sits in the middle');
});

test('a finger anywhere on the track means the rung under it, and never one past either end', () => {
  for (let rung = 0; rung < count; rung++) assert.equal(rungAt(positionAt(stopAt(rung, length, count, inset), length, count, inset), count), rung);
  assert.equal(rungAt(positionAt(-40, length, count, inset), count), 0, 'left of the track is the cheapest rung');
  assert.equal(rungAt(positionAt(length + 40, length, count, inset), count), count - 1, 'right of it is the deepest');
  // Between two stops the thumb follows the finger; it only settles when lifted.
  assert.equal(positionAt(34, length, count, inset), 0.5);
});

test('an unmeasured track or an empty ladder never produces a rung that does not exist', () => {
  assert.equal(positionAt(100, 0, count, inset), 0);
  assert.equal(rungAt(positionAt(100, length, 0, inset), 0), 0);
});

test('spoken words join what was typed with exactly one space, and replace their own last guess', () => {
  assert.equal(appendWords('', ' make it blue '), 'make it blue');
  assert.equal(appendWords('Build a timer', 'with a pause button'), 'Build a timer with a pause button');
  assert.equal(appendWords('Build a timer ', 'with'), 'Build a timer with');
  assert.equal(appendWords('Build a timer', '   '), 'Build a timer', 'silence adds nothing');
  // The recogniser re-sends its whole transcript, so each update starts from the same base.
  const base = 'Hello';
  assert.equal(appendWords(base, 'wor'), 'Hello wor');
  assert.equal(appendWords(base, 'world'), 'Hello world');
});
