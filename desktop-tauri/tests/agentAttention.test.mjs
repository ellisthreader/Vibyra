import assert from "node:assert/strict";
import test from "node:test";

import { chatNeeds, useAgentAttention } from "../src/state/agentAttentionStore.ts";

const run = (state, extra = {}) => ({ state, ask: "Run audit", step: null, found: "Found six issues.", steps: 3, commands: 1, startedAt: 1, finishedAt: null, durationMs: null, ...extra });
const chat = (projectId, value) => ({ projectId, agentId: "codex", title: "GPT-6 Astra", run: value });

test("approvals always need you; finishes only when newer than what you saw", () => {
  const runs = {
    a: chat("p1", run("waiting", { step: { title: "Allow editing files?", command: null } })),
    b: chat("p2", run("done", { finishedAt: 2000 })),
    c: chat("p2", run("done", { finishedAt: 1000 })),
    d: chat("p3", run("working")),
  };
  const needs = chatNeeds(runs, { b: 1500, c: 1000 });
  assert.deepEqual(needs.map((need) => [need.sessionId, need.kind, need.projectId]), [["a", "approval", "p1"], ["b", "finished", "p2"]]);
  assert.equal(needs[0].detail, "Allow editing files?");
  assert.equal(needs[1].detail, "Found six issues.");
});

test("a chat first met already finished is not news; one that finishes later is", () => {
  useAgentAttention.setState({ runs: {}, seen: {} });
  const store = useAgentAttention.getState();
  store.setRun("old", chat("p1", run("done", { finishedAt: 1000 })));
  store.setRun("live", chat("p1", run("working")));
  assert.equal(chatNeeds(useAgentAttention.getState().runs, useAgentAttention.getState().seen).length, 0);
  useAgentAttention.getState().setRun("live", chat("p1", run("done", { finishedAt: 5000 })));
  const state = useAgentAttention.getState();
  assert.deepEqual(chatNeeds(state.runs, state.seen).map((need) => need.sessionId), ["live"]);
  state.markSeen("live");
  const after = useAgentAttention.getState();
  assert.equal(chatNeeds(after.runs, after.seen).length, 0, "opening the chat clears it");
  after.keep(["old"]);
  assert.deepEqual(Object.keys(useAgentAttention.getState().runs), ["old"], "closed chats drop out");
});

test("clearing an approval hides only that request; clearing a finish marks it seen", () => {
  useAgentAttention.setState({ runs: {}, seen: {}, dismissed: {} });
  const ask = (title) => chat("p1", run("waiting", { startedAt: 10, step: { title, command: null } }));
  useAgentAttention.getState().setRun("a", ask("Allow editing files?"));
  useAgentAttention.getState().setRun("b", chat("p2", run("working")));
  useAgentAttention.getState().setRun("b", chat("p2", run("done", { finishedAt: 9000 })));
  let state = useAgentAttention.getState();
  const [approval, finished] = chatNeeds(state.runs, state.seen, state.dismissed);
  state.dismiss(approval); state.dismiss(finished);
  state = useAgentAttention.getState();
  assert.equal(chatNeeds(state.runs, state.seen, state.dismissed).length, 0);
  state.setRun("a", ask("Allow running npm install?"));
  state = useAgentAttention.getState();
  assert.deepEqual(chatNeeds(state.runs, state.seen, state.dismissed).map((need) => need.detail), ["Allow running npm install?"], "a new question shows again");
});
