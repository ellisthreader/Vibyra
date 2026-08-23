import assert from "node:assert/strict";
import test from "node:test";

import { attach, clear, dispatch, replay } from "../src/lib/terminalBus.ts";

test("a late resync supersedes hidden output but keeps exit last", () => {
  const seen = [];
  replay(
    [
      { type: "output", data: "stale" },
      { type: "exit", code: 0 },
      { type: "resync", data: "authoritative" },
    ],
    (event) => seen.push(event),
  );

  assert.deepEqual(seen, [
    { type: "resync", data: "authoritative" },
    { type: "exit", code: 0 },
  ]);
});

test("output after a resync is replayed before the exit marker", () => {
  const seen = [];
  replay(
    [
      { type: "output", data: "old" },
      { type: "resync", data: "snapshot" },
      { type: "output", data: "new" },
      { type: "exit", code: 1 },
    ],
    (event) => seen.push(event),
  );

  assert.deepEqual(seen.map((event) => event.type), ["resync", "output", "exit"]);
});

test("an ordinary queued stream keeps its exact order", () => {
  const events = [
    { type: "output", data: "one" },
    { type: "output", data: "two" },
    { type: "exit", code: 0 },
  ];
  const seen = [];
  replay(events, (event) => seen.push(event));
  assert.deepEqual(seen, events);
});

test("late events from a destroyed native session are discarded", () => {
  const seen = [];
  clear(9_999);
  dispatch(9_999, { type: "exit", code: 0 });
  attach(9_999, (event) => seen.push(event));
  assert.deepEqual(seen, []);
});
