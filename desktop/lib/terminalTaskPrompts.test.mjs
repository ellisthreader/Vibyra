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

test("uses read-only reviewer roles when the user forbids code changes", () => {
  const tasks = agenticTerminalTasks({
    tasks: [
      { task: "Investigate: front-end audit of the terminal page" },
      { task: "Review terminal page interaction states" },
      { task: "Trace terminal page state and rendering" }
    ]
  }, {
    userPrompt: "Assign three open terminals to audit the terminal page. Do not change any code."
  });

  assert.match(tasks[0].prompt, /Frontend reproduction and evidence reviewer/);
  assert.match(tasks[1].prompt, /Frontend interaction and accessibility reviewer/);
  assert.match(tasks[2].prompt, /Frontend state and architecture reviewer/);
  for (const task of tasks) {
    assert.match(task.prompt, /Strictly read-only/);
    assert.match(task.prompt, /do not create, edit, format, generate, or delete files/i);
    assert.match(task.prompt, /State explicitly that no files were changed/);
    assert.doesNotMatch(task.prompt, /implement the smallest complete fix/i);
  }
});

test("treats without-changing wording as a read-only terminal assignment", () => {
  const [task] = agenticTerminalTasks({
    tasks: [{ task: "Investigate: front-end diagnosis of the terminal page" }]
  }, {
    userPrompt: "Diagnose the terminal page without changing any code."
  });

  assert.match(task.prompt, /Strictly read-only/);
  assert.match(task.prompt, /do not create, edit, format, generate, or delete files/i);
  assert.doesNotMatch(task.prompt, /implement the smallest complete fix/i);
});

test("recognizes common diagnosis-only wording from user or task text", () => {
  const prompts = [
    { userPrompt: "Diagnose the terminal page, but don't make changes." },
    { userPrompt: "Do a diagnosis only of the terminal page." },
    { userPrompt: "Review the terminal page with no modifications." },
    { userPrompt: "Inspect the terminal page without making any code changes." },
    { userPrompt: "Audit the terminal page and only report findings." },
    { userPrompt: "", task: "Audit the terminal page read-only." }
  ];

  for (const item of prompts) {
    const [task] = agenticTerminalTasks({
      tasks: [{ task: item.task || "Investigate the terminal page" }]
    }, { userPrompt: item.userPrompt });
    assert.match(task.prompt, /Strictly read-only/);
    assert.doesNotMatch(task.prompt, /implement the smallest complete fix/i);
  }
});

test("defaults audits to read-only unless the user explicitly requests fixes", () => {
  const [audit] = agenticTerminalTasks({
    tasks: [{ task: "Investigate: a front-end audit of the terminal page" }]
  }, { userPrompt: "Use three terminals for a front-end audit of the terminal page." });
  const [fix] = agenticTerminalTasks({
    tasks: [{ task: "Investigate and fix the terminal page" }]
  }, { userPrompt: "Audit and fix the terminal page." });

  assert.match(audit.prompt, /Strictly read-only/);
  assert.doesNotMatch(audit.prompt, /implement the smallest complete fix/i);
  assert.match(fix.prompt, /implement the smallest complete fix/i);
});
