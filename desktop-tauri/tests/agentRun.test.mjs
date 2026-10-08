import assert from "node:assert/strict";
import test from "node:test";

import { agentRun, cleanCommand, plainReply, shortDuration } from "../src/lib/agentRun.ts";

const snap = (turnState, items, turnId = "t2") => ({ sessionId: "s", projectId: "p", generation: "g", cursor: 1, processState: "running", turnState, turnId, items, hasMore: false });
const earlier = [
  { id: "u1", turnId: "t1", kind: "message", role: "user", text: "test" },
  { id: "r1", turnId: "t1", kind: "result", title: "Finished", durationMs: 1000, updatedAt: "2026-10-05T09:00:00Z" },
];
const ask = { id: "u2", turnId: "t2", kind: "message", role: "user", text: "Run audit of code base", startedAt: "2026-10-05T10:14:56Z" };
const think = { id: "a1", turnId: "t2", kind: "activity", title: "Thinking" };
const cmd = { id: "a2", turnId: "t2", kind: "activity", title: "Running command", command: `/bin/zsh -lc "rg -n 'adopt_session' src/account_login.rs"` };

test("a working agent shows its latest request, live step and counts", () => {
  const run = agentRun(snap("running", [...earlier, ask, think, cmd]));
  assert.equal(run.state, "working");
  assert.equal(run.ask, "Run audit of code base");
  assert.deepEqual(run.step, { title: "Running command", command: "rg -n 'adopt_session' src/account_login.rs" });
  assert.equal(run.steps, 2);
  assert.equal(run.commands, 1);
  assert.equal(run.startedAt, Date.parse("2026-10-05T10:14:56Z"));
});

test("a finished agent shows what it found and how long it took, never an older turn", () => {
  const reply = { id: "m", turnId: "t2", kind: "message", role: "assistant", text: "Found **six additional issues**. No app code changed." };
  const result = { id: "r2", turnId: "t2", kind: "result", title: "Finished", durationMs: 203459, updatedAt: "2026-10-05T10:18:24Z" };
  const run = agentRun(snap("completed", [...earlier, ask, think, cmd, reply, result]));
  assert.equal(run.state, "done");
  assert.equal(run.found, "Found six additional issues. No app code changed.");
  assert.equal(run.durationMs, 203459);
  assert.equal(run.finishedAt, Date.parse("2026-10-05T10:18:24Z"));
  // idle after a finished turn still reads as done
  assert.equal(agentRun(snap("idle", [...earlier, ask, reply, result])).state, "done");
});

test("a question waiting on the person is the step shown", () => {
  const question = { id: "q", turnId: "t2", kind: "permission", title: "Allow editing files?" };
  const run = agentRun(snap("waiting", [ask, cmd, question]));
  assert.equal(run.state, "waiting");
  assert.equal(run.step.title, "Allow editing files?");
});

test("a long chat whose request scrolled out still shows what it found", () => {
  const reply = { id: "m", turnId: "t9", kind: "message", role: "assistant", text: "Here and ready." };
  const result = { id: "r", turnId: "t9", kind: "result", title: "Finished", durationMs: 2000, updatedAt: "2026-10-05T07:00:00Z" };
  const run = agentRun(snap("completed", [reply, result], "t9"));
  assert.equal(run.state, "done");
  assert.equal(run.ask, null);
  assert.equal(run.found, "Here and ready.");
});

test("no snapshot or no request reads as ready", () => {
  assert.equal(agentRun(null).state, "ready");
  assert.equal(agentRun(snap("idle", [], null)).state, "ready");
});

test("helpers keep the panel to one clean line", () => {
  assert.equal(cleanCommand(`/bin/bash -lc 'npm test\n  --silent'`), "npm test --silent");
  assert.equal(cleanCommand("cargo check"), "cargo check");
  assert.equal(plainReply("- **High:** `.env` leaks\n- Medium"), "High: .env leaks Medium");
  assert.equal(shortDuration(53_000), "53s");
  assert.equal(shortDuration(203_459), "3m 23s");
});
