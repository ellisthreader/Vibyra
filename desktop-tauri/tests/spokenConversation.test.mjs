import test from "node:test";
import assert from "node:assert/strict";

import {
  advanceTurn,
  turnVerdict,
  MAX_TURN_MS,
  NOTHING_SAID_MS,
  SILENCE_MS,
  SILENCE_RMS,
} from "../src/lib/talkTurn.ts";
import { keyCaps } from "../src/lib/platform.ts";
import { shortcutCaps, shortcutLabel, DEFAULT_TALK_SHORTCUT } from "../src/lib/hotkeys.ts";

const speech = { recording: true, metered: true, rms: 0.2, seconds: 1 };
const quiet = { recording: true, metered: true, rms: 0.001, seconds: 1 };
const unmetered = { recording: true, metered: false, rms: 0, seconds: 0 };

/** Runs a script of readings through the same fold the store uses. */
function run(readings, step = 100) {
  let progress = { spokeMs: 0, quietMs: 0 };
  let elapsed = 0;
  for (const level of readings) {
    elapsed += step;
    progress = advanceTurn(progress, level, step);
    const verdict = turnVerdict(level, progress, elapsed);
    if (verdict !== "listening") return { verdict, elapsed };
  }
  return { verdict: "listening", elapsed };
}

const held = (level, ms, step = 100) => Array.from({ length: Math.round(ms / step) }, () => level);

test("a turn ends on the pause after speech, not on the pauses inside it", () => {
  const sentence = [
    ...held(speech, 1_500),
    ...held(quiet, 400), // drawing breath mid-sentence
    ...held(speech, 1_200),
    ...held(quiet, SILENCE_MS + 200),
  ];
  const { verdict, elapsed } = run(sentence);
  assert.equal(verdict, "finish");
  assert.ok(elapsed > 1_500 + 400 + 1_200, "a breath inside a sentence must not end the turn");
  assert.ok(elapsed <= 1_500 + 400 + 1_200 + SILENCE_MS + 200, "the pause after it must");
});

test("silence alone closes the microphone instead of billing an empty turn", () => {
  const { verdict, elapsed } = run(held(quiet, NOTHING_SAID_MS + 1_000));
  assert.equal(verdict, "nothing", "nothing said means nothing to transcribe");
  assert.ok(elapsed <= NOTHING_SAID_MS + 100);
});

test("speech that never stops still ends at the ceiling, with what was said", () => {
  const { verdict, elapsed } = run(held(speech, MAX_TURN_MS + 1_000));
  assert.equal(verdict, "finish");
  assert.equal(elapsed, MAX_TURN_MS);
});

test("a recorder with no live level waits for the person, never guessing a pause", () => {
  assert.equal(run(held(unmetered, 30_000)).verdict, "listening");
  // The hard ceiling is the one rule that still applies without a level.
  assert.equal(run(held(unmetered, MAX_TURN_MS + 1_000)).verdict, "nothing");
  assert.deepEqual(
    advanceTurn({ spokeMs: 0, quietMs: 0 }, unmetered, 100),
    { spokeMs: 0, quietMs: 0 },
    "an unmeasurable reading must not accumulate as either speech or silence",
  );
});

test("the speech threshold sits between a quiet room and a speaking voice", () => {
  assert.ok(SILENCE_RMS > 0.001 && SILENCE_RMS < 0.05);
  assert.equal(turnVerdict(speech, { spokeMs: 100, quietMs: 0 }, 200), "listening");
  assert.equal(turnVerdict(quiet, { spokeMs: 100, quietMs: SILENCE_MS }, 2_000), "finish");
});

test("the spoken conversation has its own key, drawn as its own caps", () => {
  assert.equal(DEFAULT_TALK_SHORTCUT, "F10");
  assert.deepEqual(shortcutCaps("F10"), ["F10"]);
  assert.equal(shortcutLabel("F10"), "F10");
  assert.deepEqual(keyCaps("Mod+Shift+H", true), ["⌘", "⇧", "H"]);
  assert.deepEqual(keyCaps("Mod+Shift+H", false), ["Ctrl", "Shift", "H"]);
  assert.deepEqual(keyCaps("Enter", true), ["Enter"]);
  assert.deepEqual(keyCaps("Mod+,", true), ["⌘", ","]);
});
