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

test("expands a broad each-terminal error-finding request into deterministic tasks", () => {
  const result = desktopActionsForPrompt(
    "run tasks in each terminal to find errors on the terminal page",
    { projectId: "desktop-project" }
  );

  assert.equal(result.actions[0].type, "run_terminal_tasks");
  assert.equal(result.actions[0].target, "existing");
  assert.equal(result.actions[0].tasks.length, 12);
  assert.deepEqual(result.actions[0].tasks.slice(0, 3), [
    { task: "Inspect the terminal page for errors" },
    { task: "Run focused tests for the terminal page" },
    { task: "Review relevant code paths for the terminal page" }
  ]);
  assert.equal(result.title, "Run terminal tasks");
});

test("delegates the exact four-terminal subagent bug hunt as four tasks", () => {
  const result = desktopActionsForPrompt(
    "can you run in the 4 terminals subagents to find bugs on the tereminal page",
    { projectId: "desktop-project" }
  );

  assert.equal(result.actions[0].type, "run_terminal_tasks");
  assert.equal(result.actions[0].projectId, "desktop-project");
  assert.equal(result.actions[0].tasks.length, 4);
  assert.equal(result.actions[0].tasks.every(({ task }) => Boolean(task)), true);
});

test("assigns the reported five jobs to existing terminals", () => {
  const result = desktopActionsForPrompt(
    "perfect! now assign all 5 terminals jobs to fix terminal page by diagonsing errors",
    { projectId: "saas" }
  );

  assert.equal(result.actions[0].type, "run_terminal_tasks");
  assert.equal(result.actions[0].target, "existing");
  assert.equal(result.actions[0].projectId, "saas");
  assert.equal(result.actions[0].tasks.length, 5);
  assert.match(result.actions[0].tasks[0].task, /terminal page/i);
});

test("assigns jobs to each existing terminal using the last task clause", () => {
  const result = desktopActionsForPrompt(
    "try again and assign jobs to each terminal pls to find errors on terminal page",
    { projectId: "saas" }
  );

  assert.equal(result.actions[0].target, "existing");
  assert.equal(result.actions[0].tasks.length, 12);
  assert.equal(result.actions[0].tasks[0].task, "Inspect terminal page for errors");
});

test("gives three of seven existing terminals diagnostic jobs", () => {
  const result = desktopActionsForPrompt(
    "now with the 7 terminals you just opened can you give 3 of them the job to find and diagonse errors on the terminal page on vibyra desktop app",
    { projectId: "saas" }
  );

  assert.deepEqual(result.actions[0], {
    type: "run_terminal_tasks",
    target: "existing",
    model: "auto",
    effort: "medium",
    permissionMode: "standard",
    projectId: "saas",
    tasks: [
      { task: "Inspect the terminal page on vibyra desktop app for errors" },
      { task: "Run focused tests for the terminal page on vibyra desktop app" },
      { task: "Review relevant code paths for the terminal page on vibyra desktop app" }
    ]
  });
});

test("assigns counted work to terminals already open instead of opening more", () => {
  const result = desktopActionsForPrompt(
    "with the terminals open now assign 3 terminals to find frontend fixes to terminal picker",
    { projectId: "saas" }
  );

  assert.equal(result.actions[0].type, "run_terminal_tasks");
  assert.equal(result.actions[0].target, "existing");
  assert.equal(result.actions[0].projectId, "saas");
  assert.equal(result.actions[0].tasks.length, 3);
  assert.match(result.actions[0].tasks[0].task, /frontend fixes to terminal picker/i);
});

test("assigns a subset of numbered open terminals without launching replacements", () => {
  const result = desktopActionsForPrompt(
    "the 4 terminals open assign 2 of them to do frontend auidt of terminal page",
    { projectId: "saas" }
  );

  assert.equal(result.actions[0].type, "run_terminal_tasks");
  assert.equal(result.actions[0].target, "existing");
  assert.equal(result.actions[0].projectId, "saas");
  assert.equal(result.actions[0].tasks.length, 2);
  assert.match(result.actions[0].tasks[0].task, /frontend audit of terminal page/i);
});

test("assigns read-only audits to newly opened existing terminals", () => {
  const result = desktopActionsForPrompt(
    "Assign three of the new terminals you just opened to do a front-end audit of the terminal page. Do not change any code, just find problems.",
    { projectId: "saas" }
  );

  assert.equal(result.actions[0].type, "run_terminal_tasks");
  assert.equal(result.actions[0].target, "existing");
  assert.equal(result.actions[0].projectId, "saas");
  assert.equal(result.actions[0].tasks.length, 3);
  assert.match(result.actions[0].tasks[0].task, /front-end audit of the terminal page/i);
  assert.doesNotMatch(result.actions[0].tasks[0].task, /change any code/i);
});

test("assigns the exact requested read-only diagnosis to terminals already opened", () => {
  const result = desktopActionsForPrompt(
    "Now, I want you to assign three of the terminals you have just opened to do a front-end diagnosis of the terminal page without changing any code, just let me know what needs changing.",
    { projectId: "saas" }
  );

  assert.equal(result.actions[0].type, "run_terminal_tasks");
  assert.equal(result.actions[0].target, "existing");
  assert.equal(result.actions[0].projectId, "saas");
  assert.equal(result.actions[0].tasks.length, 3);
  assert.match(result.actions[0].tasks[0].task, /front-end diagnosis of the terminal page/i);
  assert.doesNotMatch(result.actions[0].tasks[0].task, /without changing|change any code/i);
});

test("read-only wording does not neutralize an unrelated negated desktop action", () => {
  assert.equal(
    desktopActionsForPrompt("Do not open terminals. This is a read-only request."),
    null
  );
  assert.equal(
    desktopActionsForPrompt("Never close the terminals; no code changes."),
    null
  );
});

test("diagnosis-only wording preserves the complete terminal task objective", () => {
  const result = desktopActionsForPrompt(
    "Assign three terminals to do a diagnosis only of the terminal page.",
    { projectId: "saas" }
  );

  assert.equal(result.actions[0].tasks.length, 3);
  assert.match(result.actions[0].tasks[0].task, /diagnosis only of the terminal page/i);
});

test("supports out-of subsets and never launches terminals for unsupported task wording", () => {
  const result = desktopActionsForPrompt(
    "Assign two out of the four open terminals to audit the terminal page.",
    { projectId: "saas" }
  );

  assert.equal(result.actions[0].type, "run_terminal_tasks");
  assert.equal(result.actions[0].target, "existing");
  assert.equal(result.actions[0].tasks.length, 2);
  assert.equal(
    desktopActionsForPrompt("Use three of those open terminals for a frontend audit.", { projectId: "saas" }),
    null
  );
});

test("curly-apostrophe negation prevents terminal assignment", () => {
  assert.equal(
    desktopActionsForPrompt("Don’t assign three terminals to audit the terminal page."),
    null
  );
});

test("uses the previous specific goal for a vague eight-subagent retry", () => {
  const result = desktopActionsForPrompt(
    "still not working assign 8 subagents to diagonse and fix pls",
    {
      projectId: "saas",
      history: [{
        role: "user",
        text: "try again and assign jobs to each terminal pls to find errors on terminal page"
      }]
    }
  );

  assert.equal(result.actions[0].type, "run_terminal_tasks");
  assert.equal(result.actions[0].target, "existing_then_new");
  assert.equal(result.actions[0].tasks.length, 8);
  assert.equal(result.actions[0].tasks[0].task, "Inspect terminal page for errors");
});

test("does not execute explanatory or hypothetical subagent text", () => {
  assert.equal(desktopActionsForPrompt("Can you explain why we assign 8 subagents to find bugs?"), null);
  assert.equal(desktopActionsForPrompt("We assign 8 subagents to find bugs during audits"), null);
  assert.equal(desktopActionsForPrompt("Should we assign 8 subagents to find bugs?"), null);
  assert.equal(desktopActionsForPrompt("Give me 3 examples of terminal jobs"), null);
  assert.equal(desktopActionsForPrompt("Give 3 terminal job ideas for a tutorial"), null);
  assert.equal(desktopActionsForPrompt("Should I give 3 of the terminals the job to audit errors?"), null);
  assert.equal(desktopActionsForPrompt("When tests finish, give 3 of the terminals the job to audit errors"), null);
  assert.equal(desktopActionsForPrompt("Give 3 of the 7 terminals full permissions"), null);
});

test("parses explicit numbered tasks with common top-level terminal settings", () => {
  const result = desktopActionsForPrompt(
    [
      "Assign these different tasks across terminals using GPT-5.5 with high effort and full access:",
      "1. Check the terminal page for runtime errors.",
      "2. Run the focused terminal tests.",
      "3. Review terminal state cleanup."
    ].join("\n"),
    { projectId: "desktop-project" }
  );

  assert.deepEqual(result.actions, [{
    type: "run_terminal_tasks",
    model: "gpt-5.5",
    effort: "high",
    permissionMode: "full",
    projectId: "desktop-project",
    tasks: [
      { task: "Check the terminal page for runtime errors" },
      { task: "Run the focused terminal tests" },
      { task: "Review terminal state cleanup" }
    ]
  }]);
});

test("parses bullet tasks with a common explicit project reference", () => {
  const result = desktopActionsForPrompt([
    'Delegate separate terminal tasks in project "My SaaS App":',
    "- Inspect the terminal renderer",
    "- Verify the terminal action tests"
  ].join("\n"));

  assert.deepEqual(result.actions[0], {
    type: "run_terminal_tasks",
    model: "auto",
    effort: "medium",
    permissionMode: "standard",
    projectId: "",
    projectName: "My SaaS App",
    tasks: [
      { task: "Inspect the terminal renderer" },
      { task: "Verify the terminal action tests" }
    ]
  });
});

test("keeps ordinary terminal launches and vague task chat out of task dispatch", () => {
  assert.equal(
    desktopActionsForPrompt("run 3 terminals", { projectId: "project-1" }).actions[0].type,
    "open_terminals"
  );
  assert.equal(desktopActionsForPrompt("help me split up some terminal work"), null);
  assert.equal(desktopActionsForPrompt("run a task in each terminal"), null);
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

test("does not treat a GPT model version as a terminal count", () => {
  const result = desktopActionsForPrompt("Open a GPT-5.5 Pro terminal");

  assert.equal(result.actions[0].count, 1);
  assert.equal(result.actions[0].model, "openai/gpt-5.5-pro");
});

test("keeps an explicit count before a dotted model name", () => {
  assert.equal(desktopActionsForPrompt("Open 2 GPT-5.5 terminals").actions[0].count, 2);
  assert.equal(desktopActionsForPrompt("Open two GPT-5.5 terminals").actions[0].count, 2);
});

test("captures an explicit project name instead of inheriting unrelated context", () => {
  const result = desktopActionsForPrompt(
    "open 7 5.5 gpt pro terminals on the project SaaS on my desktop",
    { projectId: "different-project" }
  );

  assert.deepEqual(result.actions[0], {
    type: "open_terminals",
    count: 7,
    model: "openai/gpt-5.5-pro",
    effort: "medium",
    permissionMode: "standard",
    projectId: "",
    projectName: "SaaS"
  });
  assert.match(result.reply, /in project SaaS/i);
});

test("separates terminal counts from GPT model versions and accepts compact aliases", () => {
  assert.equal(
    desktopActionsForPrompt("open 5 gpt 5.5 pro terminals").actions[0].model,
    "openai/gpt-5.5-pro"
  );
  assert.equal(
    desktopActionsForPrompt("open 5 gpt5.5 terminals").actions[0].model,
    "gpt-5.5"
  );
  assert.equal(
    desktopActionsForPrompt("open 7 5.5 gpt pro terminals").actions[0].model,
    "openai/gpt-5.5-pro"
  );
});

test("accepts a concise model-only terminal request", () => {
  const result = desktopActionsForPrompt("open ai 5.5");

  assert.equal(result.actions[0].count, 1);
  assert.equal(result.actions[0].model, "gpt-5.5");
});

test("captures quoted and case-preserving project names", () => {
  assert.equal(
    desktopActionsForPrompt('Launch two Codex terminals in project "My SaaS App"').actions[0].projectName,
    "My SaaS App"
  );
});

test("maps explicit whole-computer wording to the terminal-only Full PC scope", () => {
  const result = desktopActionsForPrompt("Open two GPT-5.5 terminals on my full PC", {
    projectId: "current-project"
  });

  assert.equal(result.actions[0].projectId, "full-pc");
  assert.equal("projectName" in result.actions[0], false);
});

test("plans active and close-all terminal actions", () => {
  assert.deepEqual(
    desktopActionsForPrompt("Close this terminal", { terminalId: "terminal-1" }).actions,
    [{ type: "close_terminals", scope: "active", terminalId: "terminal-1" }]
  );
  assert.deepEqual(
    desktopActionsForPrompt("Close all 9 terminals").actions,
    [{ type: "close_terminals", scope: "all", terminalId: "" }]
  );
});

test("recognizes a full-permission follow-up for all existing terminals", () => {
  const result = desktopActionsForPrompt(
    "perfect thanks can you also give all 4 of the terminals full permissions pls",
    { terminalId: "terminal-1" }
  );

  assert.deepEqual(result.actions, [{
    type: "set_terminal_permissions",
    scope: "all",
    permissionMode: "full",
    terminalId: ""
  }]);
  assert.match(result.reply, /relaunching all open Codex terminals/i);
});

test("can elevate only the active terminal", () => {
  assert.deepEqual(
    desktopActionsForPrompt("Give this terminal full access", { terminalId: "terminal-7" }).actions,
    [{
      type: "set_terminal_permissions",
      scope: "active",
      permissionMode: "full",
      terminalId: "terminal-7"
    }]
  );
});

test("does not execute negated or explanatory terminal requests", () => {
  assert.equal(desktopActionsForPrompt("Don't open any terminals"), null);
  assert.equal(desktopActionsForPrompt("Don't assign tasks across terminals to audit errors"), null);
  assert.equal(desktopActionsForPrompt("Explain how to open 5 terminals"), null);
  assert.equal(desktopActionsForPrompt("How do I show project memory?"), null);
  assert.equal(desktopActionsForPrompt("Don't give the terminals full permissions"), null);
  assert.equal(desktopActionsForPrompt("Give this terminal no full access"), null);
  assert.equal(desktopActionsForPrompt("Anything except full access for this terminal"), null);
  assert.equal(desktopActionsForPrompt("Stop talking about terminals"), null);
  assert.equal(desktopActionsForPrompt("Close terminals after tests finish"), null);
});

test("does not turn ordinary chat into a desktop action", () => {
  assert.equal(desktopActionsForPrompt("Explain how terminal permissions work"), null);
});
