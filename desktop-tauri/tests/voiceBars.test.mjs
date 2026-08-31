import assert from "node:assert/strict";
import test from "node:test";

import {
  BAR_COUNT,
  barsFromLevel,
  barsFromSpectrum,
  easeBars,
  restingBars,
  sweepBars,
} from "../src/lib/voiceBars.ts";

const inRange = (bars) => bars.every((value) => value >= 0 && value <= 1);

test("every source produces one bar per ring position, all in range", () => {
  const spectrum = new Uint8Array(128).fill(120);
  for (const bars of [
    restingBars(),
    barsFromLevel(0.5),
    barsFromSpectrum(spectrum),
    sweepBars(400),
  ]) {
    assert.equal(bars.length, BAR_COUNT);
    assert.ok(inRange(bars), JSON.stringify(bars.slice(0, 4)));
  }
});

test("silence still draws a visible ring", () => {
  // A ring that collapses to nothing reads as a broken microphone, which is
  // the one thing this display exists to rule out.
  for (const bars of [barsFromLevel(0), barsFromSpectrum(new Uint8Array(128))]) {
    assert.ok(Math.min(...bars) > 0, JSON.stringify(bars.slice(0, 4)));
  }
});

test("a louder level never produces a smaller ring", () => {
  const quiet = barsFromLevel(0.2);
  const loud = barsFromLevel(0.9);
  assert.ok(quiet.every((value, index) => loud[index] >= value));
});

test("out-of-range and non-finite levels are clamped, not propagated", () => {
  for (const level of [-1, 2, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.ok(inRange(barsFromLevel(level)), `level ${level}`);
  }
});

test("the spectrum ring is symmetric, so it reads as one voice", () => {
  const data = Uint8Array.from({ length: 128 }, (_, index) => (index * 7) % 256);
  const bars = barsFromSpectrum(data);
  const half = BAR_COUNT / 2;
  for (let index = 0; index < half; index += 1) {
    assert.equal(bars[index], bars[BAR_COUNT - 1 - index]);
  }
});

test("a short spectrum buffer does not produce holes in the ring", () => {
  const bars = barsFromSpectrum(new Uint8Array(4).fill(200));
  assert.equal(bars.length, BAR_COUNT);
  assert.ok(bars.every(Number.isFinite), JSON.stringify(bars));
});

test("the sweep moves and stays inside the ring", () => {
  const first = sweepBars(0);
  const later = sweepBars(550);
  assert.notDeepEqual(first, later);
  assert.ok(inRange(later));
});

test("easing rises faster than it falls", () => {
  const flat = restingBars();
  const up = easeBars(flat, flat.map(() => 1));
  const down = easeBars(flat.map(() => 1), flat);
  assert.ok(up[0] - flat[0] > 1 - down[0], "attack should outpace release");
});

test("easing a ring towards itself leaves it unchanged", () => {
  const bars = barsFromLevel(0.6);
  assert.deepEqual(easeBars(bars, bars), bars);
});
