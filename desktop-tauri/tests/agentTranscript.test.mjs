import assert from "node:assert/strict";
import test from "node:test";

import { emptyTranscript, reduce, reduceAll } from "../src/lib/agentEventReducer.ts";

let seq = 0;
function row(event, turnId = "t1") {
  return { chatId: "c1", turnId, seq: seq++, createdMs: 0, ...event };
}
function fresh() {
  seq = 0;
  return emptyTranscript();
}

/**
 * The reason the transcript is not one row per event: a shell command arrives
 * as two events at two moments, and rendering them as two blocks puts the
 * command at the top of the screen and its output somewhere below it.
 */
test("a tool call and its output are one block, matched by call id", () => {
  const state = reduceAll([
    row({ kind: "tool.requested", callId: "x1", tool: "shell", summary: "npm test" }),
    row({ kind: "assistant.completed", text: "Running the tests." }),
    row({
      kind: "tool.output",
      callId: "x1",
      tool: "shell",
      output: "42 passing",
      exitCode: 0,
      failed: false,
    }),
  ]);

  const tools = state.blocks.filter((block) => block.type === "tool");
  assert.equal(tools.length, 1, "the output opened a second block");
  assert.equal(tools[0].summary, "npm test");
  assert.equal(tools[0].output, "42 passing");
  assert.equal(tools[0].running, false);
  assert.equal(tools[0].failed, false);
});

/** Claude sends tool results as their own message, so a page can land between. */
test("output for a call that was never announced still renders", () => {
  const state = reduceAll([
    row({
      kind: "tool.output",
      callId: "orphan",
      tool: "Read",
      output: "fn main() {}",
      exitCode: null,
      failed: false,
    }),
  ]);
  const [block] = state.blocks;
  assert.equal(block.type, "tool");
  assert.equal(block.output, "fn main() {}");
  assert.equal(block.running, false);
});

/**
 * Deltas make typing feel live and are replaced wholesale by the completion.
 * A reload must look identical to what was on screen, and this is why it does:
 * only the completion is ever stored, and it lands in the same block.
 */
test("streamed deltas collapse into the completion rather than doubling it", () => {
  let state = fresh();
  for (const chunk of ["Look", "ing at ", "the parser."]) {
    state = reduce(state, { chatId: "c1", turnId: "t1", seq: -1, createdMs: 0, kind: "assistant.delta", text: chunk });
  }
  const streaming = state.blocks.filter((block) => block.type === "assistant");
  assert.equal(streaming.length, 1);
  assert.equal(streaming[0].streaming, true);
  assert.equal(streaming[0].text, "Looking at the parser.");

  state = reduce(state, row({ kind: "assistant.completed", text: "Looking at the parser." }));
  const settled = state.blocks.filter((block) => block.type === "assistant");
  assert.equal(settled.length, 1, "the completion added a second copy");
  assert.equal(settled[0].streaming, false);
});

/** A reconnect that replays the tail must cost nothing. */
test("a row already folded in is ignored", () => {
  const first = row({ kind: "assistant.completed", text: "once" });
  let state = reduce(emptyTranscript(), first);
  const before = state.blocks.length;
  state = reduce(state, first);
  assert.equal(state.blocks.length, before);
});

/** Eleven file edits is a list, not eleven blocks. */
test("consecutive file changes collapse into one list", () => {
  const state = reduceAll([
    row({ kind: "file.changed", path: "/w/a.rs", change: "update" }),
    row({ kind: "file.changed", path: "/w/b.rs", change: "add" }),
    row({ kind: "assistant.completed", text: "Done." }),
    row({ kind: "file.changed", path: "/w/c.rs", change: "update" }),
  ]);

  const lists = state.blocks.filter((block) => block.type === "files");
  assert.equal(lists.length, 2, "a change after other output starts a new list");
  assert.deepEqual(
    lists[0].paths.map((entry) => entry.path),
    ["/w/a.rs", "/w/b.rs"],
  );
});

/** A failed turn is something the user can read, not a silent stop. */
test("a failed turn renders as an error notice carrying the provider's words", () => {
  const state = reduceAll([
    row({ kind: "turn.started", prompt: "ship it" }),
    row({ kind: "turn.failed", message: "No conversation found with session ID" }),
  ]);
  const notice = state.blocks.find((block) => block.type === "notice");
  assert.equal(notice.tone, "error");
  assert.match(notice.text, /No conversation found/);
});

/** Usage accumulates across turns; a provider that reports no cost leaves it null. */
test("usage adds up and an unpriced provider stays unpriced", () => {
  let state = reduceAll([
    row({ kind: "usage.updated", inputTokens: 100, outputTokens: 20, costUsd: null }),
    row({ kind: "usage.updated", inputTokens: 50, outputTokens: 5, costUsd: null }),
  ]);
  assert.deepEqual(state.usage, { inputTokens: 150, outputTokens: 25, costUsd: null });

  state = reduce(state, row({ kind: "usage.updated", inputTokens: 0, outputTokens: 0, costUsd: 0.25 }));
  assert.equal(state.usage.costUsd, 0.25);
});

/** The events that move the header, not the transcript, render as nothing. */
test("session and approval bookkeeping adds no blocks", () => {
  const state = reduceAll([
    row({ kind: "session.identified", sessionId: "abc" }),
    row({ kind: "turn.completed", result: "ok" }),
    row({ kind: "approval.requested", approvalId: "a1", action: "github.comment" }),
    row({ kind: "approval.resolved", approvalId: "a1", approved: true }),
  ]);
  assert.equal(state.blocks.length, 0);
});
