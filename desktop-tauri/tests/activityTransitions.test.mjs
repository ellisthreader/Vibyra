import assert from "node:assert/strict";
import test from "node:test";

import {
  IDLE_MIN_WORK_MS,
  IDLE_SETTLE_MS,
  detectTransitions,
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
  assert.deepEqual(transitions, [{ id: 1, kind: "attention" }]);
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
  assert.deepEqual(transitions, [{ id: 1, kind: "attention" }]);
});

test("going quiet says nothing unless the preference is on", () => {
  const steps = [
    [1_000, { 1: "working" }],
    [1_000 + IDLE_MIN_WORK_MS, { 1: "idle" }],
    [1_000 + IDLE_MIN_WORK_MS + IDLE_SETTLE_MS, { 1: "idle" }],
  ];
  assert.deepEqual(replay(steps).transitions, []);
  assert.deepEqual(replay(steps, { idleEnabled: true }).transitions, [{ id: 1, kind: "quiet" }]);
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
  assert.deepEqual(transitions, [{ id: 1, kind: "attention" }]);
});
