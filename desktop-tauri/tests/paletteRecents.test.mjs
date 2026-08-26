import assert from "node:assert/strict";
import test from "node:test";

import {
  notePaletteRun,
  readPaletteRecents,
  recencyBoost,
} from "../src/lib/paletteRecents.ts";

function storage(initial = {}) {
  const data = { ...initial };
  return {
    data,
    getItem: (key) => (key in data ? data[key] : null),
    setItem: (key, value) => {
      data[key] = value;
    },
  };
}

test("a run goes to the front and is never listed twice", () => {
  const store = storage();
  notePaletteRun("sess-restart", store);
  notePaletteRun("tool-shot", store);
  notePaletteRun("sess-restart", store);
  assert.deepEqual(readPaletteRecents(store), ["sess-restart", "tool-shot"]);
});

test("the list is capped, so an old habit cannot pin the ranking forever", () => {
  const store = storage();
  for (let index = 0; index < 40; index += 1) notePaletteRun(`cmd-${index}`, store);
  const recents = readPaletteRecents(store);
  assert.ok(recents.length <= 12, `kept ${recents.length}`);
  assert.equal(recents[0], "cmd-39");
  assert.ok(!recents.includes("cmd-0"));
});

test("nothing stored, and garbage stored, both read as no history", () => {
  assert.deepEqual(readPaletteRecents(storage()), []);
  assert.deepEqual(readPaletteRecents(storage({ "vibyra.desktop.paletteRecents": "{" })), []);
  assert.deepEqual(readPaletteRecents(storage({ "vibyra.desktop.paletteRecents": '"nope"' })), []);
  // Non-strings inside a real array are dropped rather than boosted.
  const mixed = storage({ "vibyra.desktop.paletteRecents": '["a", 7, null]' });
  assert.deepEqual(readPaletteRecents(mixed), ["a"]);
});

test("a palette that cannot write still returns the new order", () => {
  const readOnly = {
    getItem: () => "[]",
    setItem: () => {
      throw new Error("quota");
    },
  };
  assert.deepEqual(notePaletteRun("tool-voice", readOnly), ["tool-voice"]);
});

test("recency is a tiebreaker, not a ranking", () => {
  const recents = ["a", "b", "c"];
  assert.ok(recencyBoost("a", recents) > recencyBoost("c", recents));
  assert.equal(recencyBoost("missing", recents), 0);
  // A phrase hit scores 1000+; habit must never be able to overturn one.
  assert.ok(recencyBoost("a", recents) < 400, "boost must stay below a word-boundary bonus");
});
