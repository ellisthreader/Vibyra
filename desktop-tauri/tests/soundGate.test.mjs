import assert from "node:assert/strict";
import test from "node:test";

import {
  MAX_VOICES,
  allowCue,
  createSoundGate,
  releaseVoice,
  takeVoice,
} from "../src/lib/soundGate.ts";

test("a category may sound at most once every 1.5 seconds", () => {
  const gate = createSoundGate();
  assert.equal(allowCue(gate, "done", "agentDone", 1_000), true);
  assert.equal(allowCue(gate, "done", "agentDone", 2_499), false);
  assert.equal(allowCue(gate, "done", "agentDone", 2_500), true);
});

test("a 400 ms global floor stops two categories firing on top of each other", () => {
  const gate = createSoundGate();
  assert.equal(allowCue(gate, "done", "agentDone", 1_000), true);
  assert.equal(allowCue(gate, "fail", "agentFailed", 1_399), false);
  assert.equal(allowCue(gate, "fail", "agentFailed", 1_400), true);
});

test("a refused cue does not reset the window it was refused by", () => {
  const gate = createSoundGate();
  allowCue(gate, "done", "agentDone", 1_000);
  allowCue(gate, "done", "agentDone", 1_100);
  assert.equal(allowCue(gate, "done", "agentDone", 2_500), true);
});

test("the none cue never plays and never consumes the floor", () => {
  const gate = createSoundGate();
  assert.equal(allowCue(gate, "none", "preview", 1_000), false);
  assert.equal(allowCue(gate, "done", "agentDone", 1_000), true);
});

test("the voice cap refuses a third concurrent cue until one is released", () => {
  const gate = createSoundGate();
  assert.equal(MAX_VOICES, 2);
  assert.equal(takeVoice(gate), true);
  assert.equal(takeVoice(gate), true);
  assert.equal(takeVoice(gate), false);
  releaseVoice(gate);
  assert.equal(takeVoice(gate), true);
});

test("releasing more than was taken cannot drive the count negative", () => {
  const gate = createSoundGate();
  releaseVoice(gate);
  releaseVoice(gate);
  assert.equal(gate.voices, 0);
});
