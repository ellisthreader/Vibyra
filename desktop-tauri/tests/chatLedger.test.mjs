import assert from "node:assert/strict";
import test from "node:test";

import {
  MAX_CONTEXT_TURNS,
  applyDelta,
  contextFor,
  dropTurn,
  settleTurn,
} from "../src/state/chatLedger.ts";

const turn = (id, role, content, status = "complete", extra = {}) => ({
  id,
  role,
  content,
  status,
  createdAt: 0,
  ...extra,
});

test("a delta that lands after the reply settled cannot re-open it", () => {
  const settled = [turn("u1", "user", "Why?"), turn("a1", "assistant", "Because.")];
  assert.equal(applyDelta(settled, "a1", " And more."), settled);
  assert.equal(settled[1].content, "Because.");

  const live = [turn("a1", "assistant", "Bec", "streaming")];
  const grown = applyDelta(live, "a1", "ause.");
  assert.equal(grown[0].content, "Because.");
  assert.notEqual(grown, live, "a real delta does produce a new array");
});

test("a no-op keeps the same array, and a real edit keeps every other turn's identity", () => {
  const turns = [turn("u1", "user", "Why?"), turn("a1", "assistant", "", "streaming")];
  assert.equal(applyDelta(turns, "gone", "text"), turns, "a delta for a missing id is inert");
  assert.equal(applyDelta(turns, "a1", ""), turns, "an empty delta is inert");
  assert.equal(settleTurn(turns, "gone", { status: "failed" }), turns);
  assert.equal(dropTurn(turns, "gone"), turns);

  const next = settleTurn(turns, "a1", { content: "Because.", status: "complete" });
  assert.equal(next[0], turns[0], "the question keeps its identity, so memo() holds");
  assert.notEqual(next[1], turns[1]);
  assert.equal(next[1].status, "complete");
});

test("context caps at sixteen turns from the newest end and keeps a stopped partial", () => {
  const many = Array.from({ length: 40 }, (_, index) =>
    turn(`t${index}`, index % 2 ? "assistant" : "user", `turn ${index}`),
  );
  const context = contextFor(many);
  assert.equal(context.length, MAX_CONTEXT_TURNS);
  assert.equal(MAX_CONTEXT_TURNS, 16);
  assert.equal(context.at(-1).content, "turn 39");
  assert.deepEqual(Object.keys(context[0]), ["role", "content"], "only the wire fields travel");

  const mixed = [
    turn("u1", "user", "Why?"),
    turn("a1", "assistant", "Half an ans", "complete", { stopped: true }),
    turn("u2", "user", "Go on."),
    turn("a2", "assistant", "", "failed", { error: "no key" }),
    turn("a3", "assistant", "", "streaming"),
  ];
  assert.deepEqual(
    contextFor(mixed).map((entry) => entry.content),
    ["Why?", "Half an ans", "Go on."],
    "a stopped partial is real context; an empty failure and the placeholder are not",
  );
});

test("dropping a failed reply for a retry leaves the question that asked it", () => {
  const turns = [
    turn("u1", "user", "What changed?"),
    turn("a1", "assistant", "", "failed", { replyTo: "u1", error: "no key" }),
  ];
  const dropped = dropTurn(turns, "a1");
  assert.deepEqual(
    dropped.map((entry) => entry.id),
    ["u1"],
  );
  assert.equal(dropped[0], turns[0]);
  assert.deepEqual(contextFor(dropped).map((entry) => entry.content), ["What changed?"]);
});
