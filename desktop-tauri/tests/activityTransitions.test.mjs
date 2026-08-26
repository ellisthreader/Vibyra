import assert from "node:assert/strict";
import test from "node:test";

import {
  AUTO_HIBERNATE_IDLE_MS,
  IDLE_MIN_WORK_MS,
  IDLE_SETTLE_MS,
  attentionVerdict,
  detectTransitions,
  shouldAutoHibernate,
} from "../src/lib/activityTransitions.ts";

function context(overrides = {}) {
  return { now: 1_000, focusedId: null, windowFocused: true, idleEnabled: false, ...overrides };
}

/** Replays a script of [now, activityMap] steps, collecting every transition. */
function replay(steps, base = {}) {
  let phases = new Map();
  const seen = [];
  for (const [now, next, extra] of steps) {
    const result = detectTransitions(phases, next, context({ ...base, ...extra, now }));
    phases = result.phases;
    seen.push(...result.transitions);
  }
  return { phases, transitions: seen };
}

test("entering attention fires once, and staying there does not repeat", () => {
  const { transitions } = replay([
    [1_000, { 1: "working" }],
    [2_500, { 1: "attention" }],
    [4_000, { 1: "attention" }],
    [5_500, { 1: "attention" }],
  ]);
  assert.deepEqual(transitions, [{ id: 1, kind: "attention", workedMs: 1_500 }]);
});

test("leaving and re-entering attention fires again", () => {
  const { transitions } = replay([
    [1_000, { 1: "attention" }],
    [2_500, { 1: "working" }],
    [4_000, { 1: "attention" }],
  ]);
  assert.equal(transitions.length, 2);
});

test("a pane the user is already looking at stays silent", () => {
  const { transitions } = replay(
    [[1_000, { 1: "working" }], [2_500, { 1: "attention" }]],
    { focusedId: 1, windowFocused: true },
  );
  assert.deepEqual(transitions, []);
});

test("a focused pane still speaks up when the window is in the background", () => {
  const { transitions } = replay(
    [[1_000, { 1: "working" }], [2_500, { 1: "attention" }]],
    { focusedId: 1, windowFocused: false },
  );
  assert.deepEqual(transitions, [{ id: 1, kind: "attention", workedMs: 1_500 }]);
});

test("going quiet says nothing unless the preference is on", () => {
  const steps = [
    [1_000, { 1: "working" }],
    [1_000 + IDLE_MIN_WORK_MS, { 1: "idle" }],
    [1_000 + IDLE_MIN_WORK_MS + IDLE_SETTLE_MS, { 1: "idle" }],
  ];
  assert.deepEqual(replay(steps).transitions, []);
  assert.deepEqual(replay(steps, { idleEnabled: true }).transitions, [{ id: 1, kind: "quiet", workedMs: IDLE_MIN_WORK_MS }]);
});

test("a short burst of work is not a run worth announcing", () => {
  // Two seconds of output then silence is a chat reply, not a finished job.
  const { transitions } = replay(
    [
      [1_000, { 1: "working" }],
      [3_000, { 1: "idle" }],
      [3_000 + IDLE_SETTLE_MS, { 1: "idle" }],
    ],
    { idleEnabled: true },
  );
  assert.deepEqual(transitions, []);
});

test("quiet needs the silence to settle, not just to start", () => {
  const { transitions } = replay(
    [
      [1_000, { 1: "working" }],
      [1_000 + IDLE_MIN_WORK_MS, { 1: "idle" }],
      [1_000 + IDLE_MIN_WORK_MS + 1_500, { 1: "idle" }],
    ],
    { idleEnabled: true },
  );
  assert.deepEqual(transitions, []);
});

test("quiet is announced once per run, not once per tick", () => {
  const start = 1_000 + IDLE_MIN_WORK_MS;
  const { transitions } = replay(
    [
      [1_000, { 1: "working" }],
      [start, { 1: "idle" }],
      [start + IDLE_SETTLE_MS, { 1: "idle" }],
      [start + IDLE_SETTLE_MS + 1_500, { 1: "idle" }],
      [start + IDLE_SETTLE_MS + 3_000, { 1: "idle" }],
    ],
    { idleEnabled: true },
  );
  assert.equal(transitions.length, 1);
});

test("an acknowledged attention run cannot come back as a quiet toast", () => {
  // The attention edge spends the run; settling afterwards has nothing left.
  const attn = 1_000 + 30_000;
  const { transitions } = replay(
    [
      [1_000, { 1: "working" }],
      [attn, { 1: "attention" }],
      [attn + 1_500, { 1: "idle" }],
      [attn + 1_500 + IDLE_SETTLE_MS, { 1: "idle" }],
      [attn + 3_000 + IDLE_SETTLE_MS, { 1: "idle" }],
    ],
    { idleEnabled: true },
  );
  assert.deepEqual(transitions, [{ id: 1, kind: "attention", workedMs: 30_000 }]);
});

test("a long-settled run is not borrowed by a stray attention hours later", () => {
  const idleAt = 1_000 + 30_000;
  const hoursLater = idleAt + 4 * 3_600_000;
  const { transitions } = replay([
    [1_000, { 1: "working" }],
    [idleAt, { 1: "idle" }],
    [hoursLater, { 1: "idle" }],
    [hoursLater + 1_500, { 1: "attention" }],
  ]);
  assert.deepEqual(transitions.at(-1), { id: 1, kind: "attention", workedMs: 0 });
});

test("a fresh settle still lends its stretch to the verdict", () => {
  const idleAt = 1_000 + 30_000;
  const { transitions } = replay([
    [1_000, { 1: "working" }],
    [idleAt, { 1: "idle" }],
    [idleAt + 3_000, { 1: "attention" }],
  ]);
  assert.deepEqual(transitions, [{ id: 1, kind: "attention", workedMs: 30_000 }]);
});

test("a closed pane leaves no phase behind", () => {
  const { phases } = replay([
    [1_000, { 1: "working", 2: "working" }],
    [2_500, { 2: "working" }],
  ]);
  assert.deepEqual([...phases.keys()], [2]);
});

test("a suspended pane reappearing under a new id starts clean", () => {
  // Restored panes carry negative ids and real sessions count up from 1, so an
  // id can legitimately vanish and a different one take over the same work.
  const { transitions } = replay([
    [1_000, { "-1": "idle" }],
    [2_500, { 1: "attention" }],
  ]);
  assert.deepEqual(transitions, [{ id: 1, kind: "attention", workedMs: 0 }]);
});

test("attention entered from idle carries the working stretch that preceded it", () => {
  // A run works, settles, then leaves a question-looking tail: the edge must
  // remember it worked, or the verdict cannot tell "finished" from a shell.
  const { transitions } = replay([
    [1_000, { 1: "working" }],
    [1_000 + IDLE_MIN_WORK_MS, { 1: "idle" }],
    [3_000 + IDLE_MIN_WORK_MS, { 1: "attention" }],
  ]);
  assert.deepEqual(transitions, [{ id: 1, kind: "attention", workedMs: IDLE_MIN_WORK_MS }]);
});

test("the verdict only says ask for a parsed prompt or an explicit bell", () => {
  assert.equal(attentionVerdict(true, false, 0), "ask");
  assert.equal(attentionVerdict(true, true, IDLE_MIN_WORK_MS), "ask");
  assert.equal(attentionVerdict(false, true, 0), "bell");
  // The misfire this exists to end: no prompt on screen, a real run behind
  // it — that is a completion, never a permission request.
  assert.equal(attentionVerdict(false, false, IDLE_MIN_WORK_MS), "finished");
  assert.equal(attentionVerdict(false, false, IDLE_MIN_WORK_MS - 1), "silent");
});

test("auto-hibernate takes long-idle panes and nothing else", () => {
  const now = 1_000_000;
  const idle = (sinceMs) => ({ state: "idle", since: now - sinceMs, workedMs: 0, quietNotified: false });
  assert.equal(shouldAutoHibernate(idle(AUTO_HIBERNATE_IDLE_MS), 1, null, now), true);
  assert.equal(shouldAutoHibernate(idle(AUTO_HIBERNATE_IDLE_MS - 1), 1, null, now), false);
  // Never the focused pane, and never one working or asking.
  assert.equal(shouldAutoHibernate(idle(AUTO_HIBERNATE_IDLE_MS), 1, 1, now), false);
  assert.equal(shouldAutoHibernate({ ...idle(AUTO_HIBERNATE_IDLE_MS), state: "working" }, 1, null, now), false);
  assert.equal(shouldAutoHibernate({ ...idle(AUTO_HIBERNATE_IDLE_MS), state: "attention" }, 1, null, now), false);
});
