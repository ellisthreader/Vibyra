import assert from "node:assert/strict";
import test from "node:test";

import {
  BURST_MS,
  COALESCE_WINDOW_MS,
  HISTORY_MAX,
  TOAST_MAX,
  enqueue,
  summaryTitle,
  timeoutFor,
} from "../src/state/notificationQueue.ts";

const EMPTY = { history: [], visible: [] };

function input(overrides = {}) {
  return {
    category: "agentDone",
    severity: "success",
    title: "Agent finished",
    ...overrides,
  };
}

let seq = 0;
function push(state, overrides, now) {
  seq += 1;
  return enqueue(state, input(overrides), seq, now);
}

test("an exact dedupeKey inside the window bumps count without growing history", () => {
  const first = push(EMPTY, { dedupeKey: "agentDone" }, 0);
  const second = push(first, { dedupeKey: "agentDone" }, COALESCE_WINDOW_MS - 1);
  assert.equal(second.isRepeat, true);
  assert.equal(second.history.length, 1);
  assert.equal(second.item.count, 2);
  assert.equal(second.item.id, first.item.id);
});

test("the same key past the window is a new item", () => {
  const first = push(EMPTY, { dedupeKey: "agentDone" }, 0);
  const second = push(first, { dedupeKey: "agentDone" }, COALESCE_WINDOW_MS + 1);
  assert.equal(second.isRepeat, false);
  assert.equal(second.history.length, 2);
  assert.equal(second.item.count, 1);
});

test("two same-category items inside the burst window collapse to one summary", () => {
  // No dedupeKey at all: level 2 has to catch this on category alone.
  let state = push(EMPTY, {}, 1_000);
  state = push(state, {}, 1_000);
  state = push(state, {}, 1_100);
  assert.equal(state.history.length, 1);
  assert.equal(state.visible.length, 1);
  assert.equal(state.item.count, 3);
  assert.equal(state.item.title, "3 agents finished");
});

test("a different category in the same instant stays its own item", () => {
  const first = push(EMPTY, {}, 500);
  const second = push(first, { category: "agentFailed", severity: "danger" }, 500);
  assert.equal(second.isRepeat, false);
  assert.equal(second.history.length, 2);
});

test("a repeat outside the burst window keeps its own wording", () => {
  const first = push(EMPTY, { dedupeKey: "k" }, 0);
  const second = push(first, { dedupeKey: "k" }, BURST_MS + 500);
  assert.equal(second.item.count, 2);
  assert.equal(second.item.title, "Agent finished");
});

test("history is a capped ring, newest first", () => {
  let state = EMPTY;
  for (let i = 0; i < HISTORY_MAX + 20; i += 1) {
    // Spaced past the burst window so nothing collapses.
    state = push(state, { title: `n${i}` }, i * (BURST_MS + 1));
  }
  assert.equal(state.history.length, HISTORY_MAX);
  assert.equal(state.history[0].title, `n${HISTORY_MAX + 19}`);
});

test("the toast stack caps at three and reports what it evicted", () => {
  let state = EMPTY;
  const ids = [];
  for (let i = 0; i < 4; i += 1) {
    state = push(state, { title: `n${i}` }, i * (BURST_MS + 1));
    ids.push(state.item.id);
  }
  assert.equal(state.visible.length, TOAST_MAX);
  // The oldest toast fell off, and its timer has to be cancelled by the store.
  assert.deepEqual(state.evicted, [ids[0]]);
});

test("severity drives the dismiss timeout, and danger is sticky", () => {
  assert.equal(timeoutFor("info"), 4_500);
  assert.equal(timeoutFor("success"), 5_000);
  assert.equal(timeoutFor("warning"), 8_000);
  assert.equal(timeoutFor("danger"), 0);
});

test("every category has summary wording", () => {
  for (const category of [
    "agentAttention",
    "agentDone",
    "agentFailed",
    "performance",
    "preview",
    "aiSpend",
    "models",
    "system",
  ]) {
    assert.match(summaryTitle(category, 4), /^4 \w/);
  }
});
