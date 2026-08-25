import assert from "node:assert/strict";
import test from "node:test";

import {
  BURST_MS,
  COALESCE_WINDOW_MS,
  HISTORY_MAX,
  TOAST_MAX,
  enqueue,
  nextPinned,
  summaryTitle,
} from "../src/state/notificationQueue.ts";
import { timeoutFor } from "../src/lib/notificationTiers.ts";

const EMPTY = { history: [], visible: [] };

function input(overrides = {}) {
  return {
    kind: "agent",
    tier: "done",
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

test("two same-kind items inside the burst window collapse to one summary", () => {
  // No dedupeKey at all: level 2 has to catch this on kind alone.
  let state = push(EMPTY, {}, 1_000);
  state = push(state, {}, 1_000);
  state = push(state, {}, 1_100);
  assert.equal(state.history.length, 1);
  assert.equal(state.visible.length, 1);
  assert.equal(state.item.count, 3);
  assert.equal(state.item.title, "3 agent updates");
});

test("a different kind in the same instant stays its own item", () => {
  const first = push(EMPTY, {}, 500);
  const second = push(first, { kind: "spend", tier: "fail" }, 500);
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

test("the tier drives the dismiss timeout, and ask and fail are sticky", () => {
  assert.equal(timeoutFor("news"), 6_500);
  assert.equal(timeoutFor("done"), 5_000);
  assert.equal(timeoutFor("risk"), 12_000);
  // The two tiers that need acknowledging never leave on their own.
  assert.equal(timeoutFor("ask"), 0);
  assert.equal(timeoutFor("fail"), 0);
  // Work in progress ends when the work does, not on a clock.
  assert.equal(timeoutFor("busy"), 0);
});

test("the stack is ordered by tier, so a blocked agent is never pushed off", () => {
  // Three finished runs, then the decision that was already waiting.
  let state = push(EMPTY, { kind: "agent", tier: "done", dedupeKey: "a" }, 1_000);
  state = push(state, { kind: "preview", tier: "done", dedupeKey: "b" }, 20_000);
  state = push(state, { kind: "spend", tier: "risk", dedupeKey: "c" }, 40_000);
  const asked = push(state, { kind: "approval", tier: "ask", dedupeKey: "d" }, 60_000);

  assert.equal(asked.visible.length, TOAST_MAX);
  assert.equal(asked.visible[0].tier, "ask", "the decision takes the corner");
  assert.deepEqual(asked.visible.map((entry) => entry.tier), ["ask", "risk", "done"]);

  // And a later, lower-ranked arrival evicts a transient rather than the ask.
  const after = push(asked, { kind: "models", tier: "news", dedupeKey: "e" }, 61_000);
  assert.equal(after.visible[0].tier, "ask");
  assert.equal(after.evicted.length, 1);
  assert.ok(
    after.visible.every((entry) => entry.tier !== "news"),
    "news ranks below everything already up",
  );
});

test("an ongoing job keeps one card from beginning to end", () => {
  const started = push(EMPTY, { kind: "update", tier: "busy", replaceKey: "update", progress: 4 }, 0);
  // Well past the coalesce window: a download outlives it by minutes.
  const later = push(started, { kind: "update", tier: "busy", replaceKey: "update", progress: 61 }, 90_000);
  assert.equal(later.history.length, 1);
  assert.equal(later.item.id, started.item.id, "the card keeps its identity");
  assert.equal(later.item.progress, 61);
  assert.equal(later.item.count, 1, "progress is not a repeat count");
  assert.equal(later.isRepeat, true, "same tier, so no second chime");

  // Finishing is a different event, and that one has earned the cue.
  const done = push(later, { kind: "update", tier: "ask", replaceKey: "update" }, 120_000);
  assert.equal(done.history.length, 1);
  assert.equal(done.item.id, started.item.id);
  assert.equal(done.isRepeat, false, "a state change is not a repeat");
});

test("a pinned notice takes the banner slot, never a toast slot", () => {
  const pinned = push(EMPTY, { kind: "update", tier: "news", pinned: true }, 0);
  assert.equal(pinned.visible.length, 0);
  assert.equal(pinned.history.length, 1);
});

test("every kind has summary wording", () => {
  for (const kind of [
    "agent",
    "approval",
    "update",
    "account",
    "spend",
    "performance",
    "preview",
    "models",
    "project",
    "app",
  ]) {
    assert.match(summaryTitle(kind, 4), /^4 \w/);
  }
});

test("the banner slot is handed over, and given up, by the same push", () => {
  const offer = { id: 7, at: 0, count: 1, read: false, kind: "update", tier: "news", title: "0.2.1 is available", pinned: true };
  assert.equal(nextPinned(null, offer), offer, "a pinned notice takes the slot");

  // An unrelated toast must not evict whatever is perched.
  const toast = { ...offer, id: 8, kind: "agent", tier: "done", pinned: false };
  assert.equal(nextPinned(offer, toast), offer);

  // But the same notice turning unpinned — ready -> error, which keeps its id
  // because it supersedes — has to give the slot back.
  const failed = { ...offer, tier: "fail", pinned: false };
  assert.equal(nextPinned(offer, failed), null);
});
