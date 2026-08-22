import assert from "node:assert/strict";
import test from "node:test";

import { CUES, CUE_ORDER, cueDuration } from "../src/lib/soundCues.ts";

const MAX_TOTAL_S = 0.5;

test("the dropdown order and the cue table describe the same set", () => {
  assert.deepEqual([...CUE_ORDER].sort(), Object.keys(CUES).sort());
  assert.equal(new Set(CUE_ORDER).size, CUE_ORDER.length);
});

test("none is silent", () => {
  assert.deepEqual(CUES.none, []);
  assert.equal(cueDuration("none"), 0);
});

test("no cue can clip, blast, or drone", () => {
  for (const id of CUE_ORDER) {
    if (id === "none") continue;
    assert.ok(CUES[id].length > 0, `${id} has no tones`);
    for (const tone of CUES[id]) {
      assert.ok(tone.dur > 0, `${id}: zero-length tone`);
      assert.ok(tone.gain > 0 && tone.gain <= 1, `${id}: gain out of range`);
      assert.ok(tone.attack > 0 && tone.attack < tone.dur, `${id}: bad attack`);
      assert.ok(tone.start >= 0, `${id}: negative start`);
      for (const freq of [tone.freq, tone.endFreq ?? tone.freq]) {
        assert.ok(freq >= 40 && freq <= 8_000, `${id}: ${freq} Hz is outside the useful band`);
      }
    }
    assert.ok(cueDuration(id) <= MAX_TOTAL_S, `${id} runs for ${cueDuration(id)}s`);
  }
});

test("cues stay in the sine/triangle register — never a square-wave beep", () => {
  for (const id of CUE_ORDER) {
    for (const tone of CUES[id]) {
      assert.ok(tone.type === "sine" || tone.type === "triangle", `${id}: ${tone.type}`);
    }
  }
});

test("the designed contours survive an edit", () => {
  // done rises, fail falls — reversing either inverts the meaning of the sound.
  assert.ok(CUES.done[1].freq > CUES.done[0].freq);
  assert.ok(CUES.fail[0].endFreq < CUES.fail[0].freq);
  assert.equal(CUES.ask.length, 3);
  assert.equal(CUES.blip.length, 1);
});
