import test from "node:test";
import assert from "node:assert/strict";
import { desktopActionsForPrompt } from "./desktopActions.mjs";

test("plans a multi-terminal Codex launch from natural language", () => {
  const result = desktopActionsForPrompt(
    "Open 8 terminals with Codex 5.5 fast full permissions",
    { projectId: "project-1" }
  );

  assert.deepEqual(result.actions, [{
    type: "open_terminals",
    count: 8,
    model: "gpt-5.5",
    effort: "low",
    permissionMode: "full",
    projectId: "project-1"
  }]);
  assert.match(result.reply, /watch them live/i);
  assert.match(result.reply, /Voice and Memory/);
});

test("keeps normal terminal requests on standard permissions", () => {
  const result = desktopActionsForPrompt("Start three Gemini terminals");

  assert.equal(result.actions[0].count, 3);
  assert.equal(result.actions[0].model, "gemini-2.5-pro");
  assert.equal(result.actions[0].permissionMode, "standard");
});

test("opens Voice and Memory as local companion actions", () => {
  assert.equal(desktopActionsForPrompt("/voice").actions[0].mode, "voice");
  assert.equal(desktopActionsForPrompt("Show Vibyra memory").actions[0].mode, "memory");
});

test("does not turn ordinary chat into a desktop action", () => {
  assert.equal(desktopActionsForPrompt("Explain how terminal permissions work"), null);
});

test("trains explicit subagent delivery requests into coordinated terminal jobs", () => {
  const result = desktopActionsForPrompt(
    "Use 5 subagents to plan, implement, test, and review the terminal page with relevant skills",
    { projectId: "project-1" }
  );
  const action = result.actions[0];

  assert.equal(action.type, "run_agentic_terminal_job");
  assert.equal(action.count, 5);
  assert.equal(action.agent, "codex");
  assert.equal(action.projectId, "project-1");
  assert.equal(action.permissionMode, "standard");
  assert.deepEqual(action.assignments.map((item) => item.role), [
    "planner",
    "worker",
    "worker",
    "worker",
    "reviewer"
  ]);
  assert.match(action.assignments[0].prompt, /\{\{JOB_DIR\}\}\/plan\.md/);
  assert.match(action.assignments[4].prompt, /worker-3\.done/);
  assert.match(result.reply, /one planner/i);
});

test("agentic routing requires delivery intent and keeps full access explicit", () => {
  assert.equal(desktopActionsForPrompt("Explain how subagents use multiple terminals"), null);

  const result = desktopActionsForPrompt("Fix the auth bug with subagents and full access");
  assert.equal(result.actions[0].permissionMode, "full");
  assert.ok(result.actions[0].skills.includes("VibyraOptimse"));
});

test("plan-review-implement workflow language routes without requiring the word subagent", () => {
  const result = desktopActionsForPrompt("Make a plan, review it, then implement and test the terminal fix");
  assert.equal(result.actions[0].type, "run_agentic_terminal_job");
});

test("agentic jobs route explicit coding providers to their local agents", () => {
  assert.equal(
    desktopActionsForPrompt("Use Claude subagents to implement and review this change").actions[0].agent,
    "claude"
  );
  assert.equal(
    desktopActionsForPrompt("Use Gemini subagents to fix and review this change").actions[0].agent,
    "gemini"
  );
});
