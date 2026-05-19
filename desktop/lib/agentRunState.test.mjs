import test from "node:test";
import assert from "node:assert/strict";
import {
  activeAgentRunCount,
  assertCanStartAgentRun,
  currentAgentRun,
  listAgentRuns,
  maxConcurrentAgentRuns,
  putAgentRun,
  removeAgentRun,
  updateAgentRun
} from "./agentRunState.mjs";

test("agent run cap defaults to 12 and honors account cap when present", () => {
  assert.equal(maxConcurrentAgentRuns(null), 12);
  assert.equal(maxConcurrentAgentRuns({}), 12);
  assert.equal(maxConcurrentAgentRuns({ maxConcurrentAgents: 4 }), 4);
  assert.equal(maxConcurrentAgentRuns({ max_concurrent_agents: "2" }), 2);
  assert.equal(maxConcurrentAgentRuns({ maxConcurrentAgents: 30 }), 12);
  assert.equal(maxConcurrentAgentRuns({ maxConcurrentAgents: 0 }), 0);
});

test("only running and applying runs count against the concurrent cap", () => {
  const state = { desktopAccount: { maxConcurrentAgents: 2 }, agentRuns: {} };
  putAgentRun(state, { id: "run-1", state: "running", title: "A" });
  putAgentRun(state, { id: "run-2", state: "waiting", title: "B" });

  assert.equal(activeAgentRunCount(state), 1);
  assert.doesNotThrow(() => assertCanStartAgentRun(state));

  updateAgentRun(state, "run-2", { state: "applying" });
  assert.equal(activeAgentRunCount(state), 2);
  assert.throws(() => assertCanStartAgentRun(state), (error) => error.message.includes("Maximum concurrent desktop agents reached (2)"));
});

test("run list and current run expose run-scoped state", () => {
  const state = { agentRuns: {} };
  putAgentRun(state, { id: "run-waiting", state: "waiting", updatedAt: "2026-05-19T10:00:00.000Z" });
  putAgentRun(state, { id: "run-running", state: "running", updatedAt: "2026-05-19T10:01:00.000Z" });

  assert.deepEqual(listAgentRuns(state).map((run) => run.id), ["run-running", "run-waiting"]);
  assert.equal(currentAgentRun(state).id, "run-running");

  removeAgentRun(state, "run-running");
  assert.equal(currentAgentRun(state).id, "run-waiting");
});
