import assert from "node:assert/strict";
import test from "node:test";

import { emptyTranscript, reduce, reduceAll } from "../src/lib/agentEventReducer.ts";
import { toolElapsed, toolShape } from "../src/lib/agentToolShape.ts";

let seq = 0;
const row = (kind, extra = {}, createdMs = 1000) => ({
  chatId: "c1",
  turnId: extra.turnId ?? "t1",
  seq: seq++,
  createdMs,
  kind,
  ...extra,
});

test("usage closes a turn, on either engine", () => {
  // The footer hangs off usage rather than `turn.completed`, because only
  // Claude emits one: Codex's `turn.completed` line carries the usage and
  // nothing else, and a successful Codex turn records no closing event at all.
  seq = 0;
  const state = reduceAll([
    row("turn.started", { prompt: "fix the flusher" }, 1_000),
    row("assistant.completed", { text: "Done." }, 4_000),
    row("usage.updated", { inputTokens: 18_200, outputTokens: 1_100, costUsd: 0.14 }, 5_400),
  ]);
  const footer = state.blocks.at(-1);
  assert.equal(footer.type, "footer");
  assert.equal(footer.inputTokens, 18_200);
  assert.equal(footer.costUsd, 0.14);
  assert.equal(footer.elapsedMs, 4_400);
  // Retry and Edit need the prompt without walking back up the transcript.
  assert.equal(footer.prompt, "fix the flusher");
});

test("a second usage row folds into the footer rather than adding one", () => {
  // A provider is free to report usage more than once in a turn, and two cost
  // lines under one answer would read as two turns.
  seq = 0;
  const state = reduceAll([
    row("turn.started", { prompt: "go" }, 1_000),
    row("usage.updated", { inputTokens: 100, outputTokens: 10, costUsd: 0.01 }, 2_000),
    row("usage.updated", { inputTokens: 50, outputTokens: 5, costUsd: 0.02 }, 3_000),
  ]);
  const footers = state.blocks.filter((block) => block.type === "footer");
  assert.equal(footers.length, 1);
  assert.equal(footers[0].inputTokens, 150);
  assert.equal(footers[0].outputTokens, 15);
  assert.equal(Number(footers[0].costUsd.toFixed(2)), 0.03);
});

test("a turn that started before this page still reports what it cost", () => {
  // Transcripts page at 400 rows, so `turn.started` can be on the page before.
  // The tokens are still real; only the elapsed time and the prompt are lost,
  // and both are absent rather than wrong.
  seq = 0;
  const state = reduce(
    emptyTranscript(),
    row("usage.updated", { inputTokens: 9, outputTokens: 1, costUsd: null }, 2_000),
  );
  const footer = state.blocks.at(-1);
  assert.equal(footer.elapsedMs, null);
  assert.equal(footer.prompt, "");
  assert.equal(footer.inputTokens, 9);
});

test("a tool block carries both timestamps", () => {
  seq = 0;
  const state = reduceAll([
    row("tool.requested", { callId: "x1", tool: "Bash", summary: "npm test" }, 1_000),
    row(
      "tool.output",
      { callId: "x1", tool: "Bash", output: "ok", exitCode: 0, failed: false },
      3_700,
    ),
  ]);
  const tool = state.blocks.find((block) => block.type === "tool");
  assert.equal(tool.running, false);
  assert.equal(toolElapsed(tool.startedMs, tool.endedMs), "2.7s");
});

test("tool names become verbs a column can be scanned by", () => {
  assert.deepEqual(toolShape("Bash", "npm test"), { verb: "Run", target: "npm test" });
  assert.deepEqual(toolShape("shell", "cargo check"), { verb: "Run", target: "cargo check" });
  assert.equal(toolShape("Read", "/home/a/b/src/lib/dockLayout.ts").verb, "Read");
  // A path is shortened from the left, where the uninformative half is.
  assert.equal(
    toolShape("Read", "/home/a/b/src/lib/dockLayout.ts").target,
    "…/lib/dockLayout.ts",
  );
  // An unknown tool keeps its own name rather than being forced into a guess.
  assert.equal(toolShape("mcp/weather", "London").verb, "mcp/weather");
});

test("elapsed time changes precision with scale", () => {
  assert.equal(toolElapsed(0, 120), "0.1s");
  assert.equal(toolElapsed(0, 2_700), "2.7s");
  assert.equal(toolElapsed(0, 95_000), "1m 35s");
  // Still running: no end, no time.
  assert.equal(toolElapsed(0, null), "");
});
