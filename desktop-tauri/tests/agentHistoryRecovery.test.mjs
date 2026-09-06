import assert from "node:assert/strict";
import test from "node:test";
import { mergeHistory } from "../src/lib/agentHistory.ts";
import { reduceAll } from "../src/lib/agentEventReducer.ts";
import { useAgentDraftStore } from "../src/state/agentDraftStore.ts";
import { liveWork } from "../src/lib/agentLiveWork.ts";
import { relativeTime } from "../src/lib/relativeTime.ts";

const row = (seq, event, turnId = "turn-1") => ({ chatId: "chat-1", turnId, seq, createdMs: seq * 1000, ...event });
test("reopening and paging preserve order without duplicating a live event", () => {
  const prompt = row(0, { kind: "turn.started", prompt: "Review" });
  const answer = row(1, { kind: "assistant.completed", text: "Reviewed" });
  const combined = mergeHistory([answer], [answer, prompt]);
  assert.deepEqual(combined.map((row) => row.seq), [0, 1]);
  assert.deepEqual(reduceAll(combined).blocks.map((block) => block.type), ["prompt", "assistant"]);
});
test("provider tool identifiers reused on a later turn do not overwrite earlier output", () => {
  const transcript = reduceAll([
    row(0, { kind: "tool.requested", callId: "item_0", tool: "Bash", summary: "first" }),
    row(1, { kind: "tool.output", callId: "item_0", tool: "Bash", output: "first result", exitCode: 0, failed: false }),
    row(2, { kind: "tool.requested", callId: "item_0", tool: "Bash", summary: "second" }, "turn-2"),
    row(3, { kind: "tool.output", callId: "item_0", tool: "Bash", output: "second result", exitCode: 0, failed: false }, "turn-2"),
  ]);
  assert.deepEqual(transcript.blocks.map((block) => block.output), ["first result", "second result"]);
});
test("drafts and permissions stay with their chat and acceptance cannot erase newer text", () => {
  const store = useAgentDraftStore.getState(); store.clear();
  store.change("a", { text: "Original", permission: "plan" });
  store.change("b", { text: "Other", permission: "standard" });
  store.change("a", { text: "Next task" }); store.consume("a", "Original");
  assert.equal(useAgentDraftStore.getState().drafts.a.text, "Next task");
  assert.equal(useAgentDraftStore.getState().drafts.b.permission, "standard");
  store.consume("b", "Other"); assert.equal(useAgentDraftStore.getState().drafts.b.text, "");
  store.clear(); assert.deepEqual(useAgentDraftStore.getState().drafts, {});
});
test("a future routine says when it will run", () => {
  assert.equal(relativeTime(Date.now() + 3600_000), "in 1h");
  assert.equal(relativeTime(Date.now() - 3600_000), "1h ago");
});

test("background task visibility does not depend on loading its chat", () => {
  const input = { chats: {}, running: {}, startedMs: {}, routines: [], runs: {}, waitingChats: [], agents: [], isParked: () => false,
    tasks: [{ id: "task", chatId: "unopened", agentId: "reviewer", status: "waiting", startedMs: 42, spec: { agentName: "Reviewer", prompt: "Review release" } }] };
  assert.equal(liveWork(input)[0].chatId, "unopened");
  assert.equal(liveWork(input)[0].parked, true);
  input.tasks[0].status = "succeeded";
  assert.deepEqual(liveWork(input), []);
});
test("native task preparation is visible before a run has been recorded", () => {
  const found = liveWork({ tasks: [], chats: {}, running: { preparing: true }, startedMs: { preparing: 30 }, routines: [], runs: {}, waitingChats: [], agents: [], isParked: () => false });
  assert.equal(found.length, 1); assert.equal(found[0].startedMs, 30); assert.equal(found[0].chatId, null);
});
