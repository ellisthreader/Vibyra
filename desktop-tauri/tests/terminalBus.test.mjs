import assert from "node:assert/strict";
import test from "node:test";

import { emptyBacklog, queueEvent } from "../src/lib/terminalBacklog.ts";
import { attach, clear, detach, dispatch } from "../src/lib/terminalBus.ts";

const output = (data) => ({ type: "output", data });

function queueAll(events, cap, keep) {
  return events.reduce((backlog, event) => queueEvent(backlog, event, cap, keep), emptyBacklog());
}

test("a queued resync replaces the output queued ahead of it", () => {
  const exit = { type: "exit", code: 0 };
  const backlog = queueAll([output("old"), exit, { type: "resync", data: "snapshot" }, output("new")]);
  assert.deepEqual(backlog.events, [exit, { type: "resync", data: "snapshot" }, output("new")]);
  assert.equal(backlog.chars, "snapshot".length + "new".length);
});

test("output below the cap is replayed exactly as it arrived", () => {
  const events = [output("a"), output("b"), output("c")];
  assert.deepEqual(queueAll(events, 3, 2).events, events);
});

test("a backlog past the cap collapses into a resync of its tail", () => {
  const backlog = queueAll([output("abc"), output("def"), { type: "exit", code: 1 }, output("gh")], 7, 4);
  assert.deepEqual(backlog.events, [{ type: "resync", data: "efgh" }, { type: "exit", code: 1 }]);
  assert.equal(backlog.chars, 4);
});

test("a collapsed tail never starts on half a surrogate pair", () => {
  const backlog = queueAll([output("ab😀"), output("cd")], 4, 3);
  assert.deepEqual(backlog.events, [{ type: "resync", data: "cd" }]);
});

test("the bus replays its backlog in order on attach", () => {
  dispatch(987, output("one"));
  dispatch(987, output("two"));
  const replay = [];
  attach(987, (event) => replay.push(event));
  assert.deepEqual(replay, [output("one"), output("two")]);
  dispatch(987, output("live"));
  assert.deepEqual(replay.at(-1), output("live"));
  detach(987);
  clear(987);
});
