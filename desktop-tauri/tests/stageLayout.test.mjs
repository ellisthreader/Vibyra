import assert from "node:assert/strict";
import test from "node:test";

import {
  STAGE_DEFAULT_RATIO,
  STAGE_DIVIDER_PX,
  STAGE_MAX_RATIO,
  STAGE_MIN_RATIO,
  clampStageRatio,
  nudgeStageRatio,
  previewVisible,
  ratioFromPointer,
  restoreStageRatio,
  saveStageRatio,
  stageColumns,
  terminalsVisible,
} from "../src/lib/stageLayout.ts";

function fakeStorage(seed = {}) {
  const store = new Map(Object.entries(seed));
  return {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, value),
    read: (key) => store.get(key),
  };
}

test("a split keeps the terminals on screen, and only full preview hides them", () => {
  // Load-bearing: the native flush budget follows this. The old mode switch
  // sent every PTY to `hidden` the moment preview was chosen.
  assert.equal(terminalsVisible("terminals"), true);
  assert.equal(terminalsVisible("split"), true);
  assert.equal(terminalsVisible("preview"), false);
});

test("preview is off screen only in the terminals layout", () => {
  assert.equal(previewVisible("terminals"), false);
  assert.equal(previewVisible("split"), true);
  assert.equal(previewVisible("preview"), true);
});

test("a single-surface layout is one column, so the hidden side costs no layout", () => {
  assert.equal(stageColumns("terminals", 0.6), "minmax(0, 1fr)");
  assert.equal(stageColumns("preview", 0.6), "minmax(0, 1fr)");
});

test("a split spends the ratio on the terminals and gives the divider its own column", () => {
  assert.equal(
    stageColumns("split", 0.6),
    `minmax(0, 0.6fr) ${STAGE_DIVIDER_PX}px minmax(0, 0.4fr)`,
  );
});

test("an out-of-range ratio is clamped rather than allowed to collapse a pane", () => {
  assert.equal(clampStageRatio(0.01), STAGE_MIN_RATIO);
  assert.equal(clampStageRatio(3), STAGE_MAX_RATIO);
  assert.equal(clampStageRatio(Number.NaN), STAGE_DEFAULT_RATIO);
  assert.match(stageColumns("split", 5), /minmax\(0, 0\.8fr\)/);
});

test("the grab point stays under the cursor as it crosses the divider", () => {
  // Half the divider's width is taken off both sides, so the midpoint of a
  // 1000px stage is still exactly half.
  assert.equal(ratioFromPointer(500, 0, 1000), 0.5);
  assert.equal(ratioFromPointer(0, 0, 1000), STAGE_MIN_RATIO);
  assert.equal(ratioFromPointer(1000, 0, 1000), STAGE_MAX_RATIO);
  // A stage narrower than the divider cannot produce a meaningful ratio.
  assert.equal(ratioFromPointer(2, 0, 4), STAGE_DEFAULT_RATIO);
});

test("arrow keys resize and every other key is left alone", () => {
  assert.equal(nudgeStageRatio(0.6, "ArrowRight"), 0.62);
  assert.equal(nudgeStageRatio(0.6, "ArrowLeft"), 0.58);
  assert.equal(nudgeStageRatio(0.6, "Home"), STAGE_MIN_RATIO);
  assert.equal(nudgeStageRatio(0.6, "End"), STAGE_MAX_RATIO);
  assert.equal(nudgeStageRatio(0.6, "Enter"), null);
  assert.equal(nudgeStageRatio(STAGE_MAX_RATIO, "ArrowRight"), STAGE_MAX_RATIO);
});

test("the ratio survives a restart, and a corrupt one falls back", () => {
  const storage = fakeStorage();
  saveStageRatio(0.42, storage);
  assert.equal(restoreStageRatio(storage), 0.42);
  assert.equal(restoreStageRatio(fakeStorage()), STAGE_DEFAULT_RATIO);
  assert.equal(restoreStageRatio(fakeStorage({ "vibyra.desktop.stageRatio": "nonsense" })), STAGE_DEFAULT_RATIO);
  // Saved values are clamped on the way in as well as on the way out.
  saveStageRatio(9, storage);
  assert.equal(restoreStageRatio(storage), STAGE_MAX_RATIO);
});

test("stage sizing never throws the workspace out when storage refuses", () => {
  const hostile = {
    getItem: () => {
      throw new Error("denied");
    },
    setItem: () => {
      throw new Error("denied");
    },
  };
  assert.equal(restoreStageRatio(hostile), STAGE_DEFAULT_RATIO);
  assert.doesNotThrow(() => saveStageRatio(0.5, hostile));
});
