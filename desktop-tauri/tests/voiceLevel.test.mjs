import assert from "node:assert/strict";
import test from "node:test";

import {
  VOICE_ATTACK,
  VOICE_RELEASE,
  pulseShape,
  smoothVoiceLevel,
} from "../src/lib/voiceLevel.ts";

test("the meter rises faster than it falls", () => {
  // Attack has to outrun release or the first syllable is swallowed; release
  // has to lag or every consonant makes the dot strobe.
  assert.ok(VOICE_ATTACK > VOICE_RELEASE);
  const rising = smoothVoiceLevel(0, 1);
  const falling = smoothVoiceLevel(1, 0);
  assert.ok(rising > 0.5, `rise reached ${rising}`);
  assert.ok(falling > 0.5, `fall dropped to ${falling}`);
});

test("silence settles the meter rather than sticking on the last syllable", () => {
  let level = 1;
  for (let tick = 0; tick < 20; tick += 1) level = smoothVoiceLevel(level, 0);
  // Twenty ticks is one second at the native rate.
  assert.ok(level < 0.02, `still at ${level} after a second of silence`);
});

test("sustained speech reaches the top of the meter", () => {
  let level = 0;
  for (let tick = 0; tick < 10; tick += 1) level = smoothVoiceLevel(level, 0.8);
  assert.ok(level > 0.79, `only reached ${level}`);
});

test("a garbage reading is treated as silence, never as a spike", () => {
  assert.equal(smoothVoiceLevel(0, Number.NaN), 0);
  assert.equal(smoothVoiceLevel(0, Number.POSITIVE_INFINITY), 0);
  assert.equal(smoothVoiceLevel(Number.NaN, 0), 0);
  // Levels outside 0..1 are clamped, not scaled.
  assert.equal(smoothVoiceLevel(1, 5), 1);
  assert.equal(smoothVoiceLevel(0, -3), 0);
});

test("the resting shape stays visible, because invisible reads as broken", () => {
  const silent = pulseShape(0);
  assert.ok(silent.opacity > 0.1, "a silent meter still has to be there");
  assert.ok(silent.halo > 0.4 && silent.core >= 1);
});

test("louder is always bigger, and the top of the range is bounded", () => {
  const quiet = pulseShape(0.2);
  const loud = pulseShape(0.9);
  const max = pulseShape(1);
  assert.ok(loud.halo > quiet.halo && loud.core > quiet.core);
  assert.ok(loud.opacity > quiet.opacity);
  assert.equal(max.halo, 1);
  assert.ok(max.core <= 1.6, "the dot must not overflow its 40px tile");
  // Out-of-range input cannot push it past the bound.
  assert.deepEqual(pulseShape(4), max);
});
