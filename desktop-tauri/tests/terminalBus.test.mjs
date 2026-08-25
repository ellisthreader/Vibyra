import assert from "node:assert/strict";
import test from "node:test";

import { attach, clear, dispatch, replay, QUEUE_CAP_CHARS } from "../src/lib/terminalBus.ts";

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

test("a queue for an unmounted pane is bounded, dropping oldest output first", () => {
  const id = 4_242;
  const chunk = "x".repeat(200_000);
  const chunks = Math.ceil(QUEUE_CAP_CHARS / chunk.length);
  dispatch(id, { type: "output", data: "the-oldest-chunk" });
  for (let index = 0; index < chunks + 2; index += 1) {
    dispatch(id, { type: "output", data: chunk });
  }
  dispatch(id, { type: "output", data: "the-newest-chunk" });

  const seen = [];
  attach(id, (event) => seen.push(event));

  const total = seen.reduce((sum, event) => sum + event.data.length, 0);
  assert.ok(total <= QUEUE_CAP_CHARS, `queued ${total} chars, cap is ${QUEUE_CAP_CHARS}`);
  assert.equal(seen.some((event) => event.data === "the-oldest-chunk"), false);
  assert.equal(seen.at(-1)?.data, "the-newest-chunk");
  clear(id);
});

test("bounding never drops resync or exit markers", () => {
  const id = 4_243;
  dispatch(id, { type: "resync", data: "snapshot" });
  const chunk = "y".repeat(500_000);
  for (let index = 0; index < 6; index += 1) {
    dispatch(id, { type: "output", data: chunk });
  }
  dispatch(id, { type: "exit", code: 0 });

  const seen = [];
  attach(id, (event) => seen.push(event));
  assert.equal(seen[0].type, "resync");
  assert.equal(seen.at(-1)?.type, "exit");
  clear(id);
});
