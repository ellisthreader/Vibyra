import assert from "node:assert/strict";
import test from "node:test";
import { agenticTerminalTasks } from "./terminalTaskPrompts.mjs";

test("builds distinct project-aware coding briefs for parallel terminal agents", () => {
  const tasks = agenticTerminalTasks({
    tasks: [
      { task: "Inspect the terminal page for errors" },
      { task: "Run focused tests for the terminal page" },
      { task: "Review relevant code paths for the terminal page" }
    ]
  }, {
    userPrompt: "Give 3 terminals jobs to diagnose and fix the terminal page",
    history: [{ role: "user", text: "The terminal task integration is not working." }],
    project: {
      name: "SaaS",
      path: "/home/ellis/Desktop/SaaS",
      stack: "Node / React"
    },
    projectFiles: [
      { path: "desktop/lib/desktopActions.mjs" },
      { path: ".env" },
      { path: "desktop/assets/app.desktop-actions.js" }
    ],
    memoryContext: [{ title: "Project memory", body: "Terminal actions execute through structured desktop actions." }]
  });

  assert.equal(tasks.length, 3);
  assert.equal(new Set(tasks.map((item) => item.task)).size, 3);
  assert.equal(tasks[0].task, "Inspect the terminal page for errors");
  assert.match(tasks[0].prompt, /# Outcome/);
  assert.match(tasks[0].prompt, /Reproduction and evidence lead/);
  assert.match(tasks[1].prompt, /Regression-test and verification lead/);
  assert.match(tasks[2].prompt, /Root-cause and implementation lead/);
  assert.match(tasks[0].prompt, /# Acceptance criteria/);
  assert.match(tasks[0].prompt, /Read-only investigation/);
  assert.match(tasks[1].prompt, /Own focused test files and fixtures only/);
  assert.match(tasks[2].prompt, /Own the primary production-code fix/);
  for (const item of tasks) {
    assert.match(item.prompt, /Source project location: \/home\/ellis\/Desktop\/SaaS/);
    assert.match(item.prompt, /Run `pwd` first/);
    assert.match(item.prompt, /desktop\/lib\/desktopActions\.mjs/);
    assert.doesNotMatch(item.prompt, /\.env/);
    assert.match(item.prompt, /Continue until your lane is complete and verified/);
    assert.match(item.prompt, /Preserve existing user and agent changes/);
    assert.match(item.prompt, /Run focused validation/);
    assert.match(item.prompt, /Stop when the acceptance criteria are met/);
    assert.match(item.prompt, /Return only a concise engineering report/);
  }
});

test("adds concrete frontend quality criteria for UI assignments", () => {
  const [task] = agenticTerminalTasks({
    tasks: [
      { task: "Investigate: improve the terminal picker UI" },
      { task: "Trace the terminal picker rendering path" }
    ]
  }, { userPrompt: "Assign 2 terminals to improve the terminal picker UI" });

  assert.match(task.prompt, /Shared objective: improve the terminal picker UI/);
  assert.doesNotMatch(task.prompt, /Shared objective: Assign 2 terminals/);
  assert.match(task.prompt, /hover, focus, loading, empty, error, and disabled states/);
  assert.match(task.prompt, /responsive behavior, keyboard use, visible focus, labels, contrast/);
});

test("preserves per-task settings while enriching the task text", () => {
  const [task] = agenticTerminalTasks({
    tasks: [{
      task: "Audit authentication",
      model: "gpt-5.5",
      effort: "high",
      projectId: "auth"
    }]
  }, { userPrompt: "Delegate the auth audit" });

  assert.equal(task.model, "gpt-5.5");
  assert.equal(task.effort, "high");
  assert.equal(task.projectId, "auth");
  assert.equal(task.task, "Audit authentication");
  assert.match(task.prompt, /Audit authentication/);
});
