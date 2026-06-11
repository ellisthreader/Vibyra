import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const source = readFileSync(new URL("./app.desktop-actions.js", import.meta.url), "utf8");

test("desktop actions open requested terminals with captured project scope", async () => {
  const calls = [];
  const context = actionContext({
    createTerminals: (...args) => calls.push(args)
  });

  const summary = await context.runDesktopActions([{
    type: "open_terminals",
    count: 2,
    model: "gpt-5.5",
    effort: "high",
    permissionMode: "standard",
    projectId: "project-1"
  }]);

  assert.deepEqual(JSON.parse(JSON.stringify(calls)), [[2, "gpt-5.5", {
    effort: "high",
    permissionMode: "standard",
    projectId: "project-1",
    workspaceMode: "worktree"
  }]]);
  assert.match(summary, /Opening 2 GPT-5\.5 terminals/);
});

test("desktop actions capture opened terminal IDs in the execution hook", async () => {
  const records = [];
  const context = actionContext({
    createTerminals(count, model, options) {
      for (let index = 0; index < count; index += 1) {
        context.terminals.unshift({
          id: `opened-${index + 1}`,
          model,
          projectId: options.projectId
        });
      }
    },
    recordDesktopActionExecution: (scope, details) => records.push({ scope, details })
  });
  const action = {
    type: "open_terminals",
    count: 2,
    model: "gpt-5.5",
    projectId: "project-1"
  };

  await context.runDesktopActions([action], { desktopActionContextScope: "chat:test" });

  assert.equal(records.length, 1);
  assert.equal(records[0].scope, "chat:test");
  assert.equal(records[0].details.executionStatus, "completed");
  assert.deepEqual(JSON.parse(JSON.stringify(records[0].details.terminalIds)), ["opened-2", "opened-1"]);
  assert.equal(records[0].details.projectId, "project-1");
  assert.match(records[0].details.batchId, /^terminal-batch-/);
});

test("desktop actions inherit terminal setup scope only when project metadata is absent", async () => {
  const calls = [];
  const context = actionContext({
    createTerminals: (...args) => calls.push(args),
    terminalProjectForSetup: () => "setup-project"
  });

  await context.runDesktopActions([{
    type: "open_terminals",
    count: 1,
    model: "gpt-5.5"
  }]);
  await context.runDesktopActions([{
    type: "open_terminals",
    count: 1,
    model: "gpt-5.5",
    projectId: ""
  }]);

  assert.equal(calls[0][2].projectId, "setup-project");
  assert.equal(calls[0][2].workspaceMode, "shared");
  assert.equal(calls[1][2].projectId, "");
  assert.equal(calls[1][2].workspaceMode, "shared");
});

test("desktop actions match provider-qualified Pro model aliases", async () => {
  const calls = [];
  const context = actionContext({
    createTerminals: (...args) => calls.push(args),
    modelChoices: () => [
      { key: "auto", label: "Auto", provider: "auto" },
      { key: "openai/gpt-5.5-pro", modelKey: "openai/gpt-5.5-pro", label: "GPT-5.5 Pro", provider: "openai" }
    ]
  });

  const summary = await context.runDesktopActions([{
    type: "open_terminals",
    count: 5,
    model: "openai/gpt-5.5-pro",
    effort: "medium",
    permissionMode: "standard",
    projectId: "project-1"
  }]);

  assert.equal(calls[0][1], "openai/gpt-5.5-pro");
  assert.equal(calls[0][2].workspaceMode, "worktree");
  assert.match(summary, /Opening 5 GPT-5\.5 Pro terminals/);
});

test("desktop actions launch supported provider models with full access", async () => {
  const calls = [];
  const context = actionContext({
    createTerminals: (...args) => calls.push(args),
    modelChoices: () => [
      { key: "openai/gpt-5.5-pro", modelKey: "openai/gpt-5.5-pro", label: "GPT-5.5 Pro", provider: "openai" }
    ]
  });

  const summary = await context.runDesktopActions([{
    type: "open_terminals",
    count: 1,
    model: "openai/gpt-5.5-pro",
    effort: "high",
    permissionMode: "full",
    projectId: "project-1"
  }]);

  assert.match(summary, /Opening 1 GPT-5\.5 Pro terminal with full access/);
  assert.equal(calls.length, 1);
  assert.equal(calls[0][2].permissionMode, "full");
});

test("desktop batch tasks assign transient prompts without dispatching input early", async () => {
  const created = [];
  const context = actionContext({
    createTerminal(model, shouldRender, options) {
      const terminal = { id: `terminal-${created.length + 1}`, model, ptyStatus: "starting" };
      created.push({ model, shouldRender, options, terminal });
      context.terminals.unshift(terminal);
      return terminal;
    },
    sendPtyInput() {
      assert.fail("desktop actions must not send task input before PTY creation");
    }
  });

  const summary = await context.runDesktopActions([{
    type: "run_terminal_tasks",
    target: "new",
    model: "gpt-5.5",
    effort: "high",
    permissionMode: "standard",
    projectId: "project-1",
    tasks: ["Audit the API", "Run the tests"]
  }]);

  assert.equal(created.length, 2);
  assert.equal(created[0].options.initialPrompt, "Audit the API");
  assert.equal(created[1].options.initialPrompt, "Run the tests");
  assert.equal(created[0].options.workspaceMode, "worktree");
  assert.equal(summary, "Queued 2 terminal tasks on separate local Git branches in Terminals.");
});

test("desktop batch tasks preserve per-task launch settings", async () => {
  const calls = [];
  const context = actionContext({
    createTerminal: (...args) => {
      calls.push(args);
      return { id: `terminal-${calls.length}`, ptyStatus: "running" };
    },
    modelChoices: () => [
      { key: "gpt-5.5", label: "GPT-5.5", provider: "openai" },
      { key: "openai/gpt-5.5-pro", modelKey: "openai/gpt-5.5-pro", label: "GPT-5.5 Pro", provider: "openai" }
    ],
    sendPtyInput() {}
  });

  await context.runDesktopActions([{
    type: "run_terminal_tasks",
    target: "new",
    model: "gpt-5.5",
    projectId: "default-project",
    tasks: [{
      task: "Review authentication",
      model: "openai/gpt-5.5-pro",
      effort: "xhigh",
      projectId: "auth-project"
    }]
  }]);

  assert.equal(calls[0][0], "openai/gpt-5.5-pro");
  assert.equal(calls[0][1], false);
  assert.deepEqual(JSON.parse(JSON.stringify(calls[0][2])), {
    effort: "xhigh",
    initialPrompt: "Review authentication",
    permissionMode: "standard",
    projectId: "auth-project",
    tokenMode: "vibyra",
    workspaceMode: "shared"
  });
});

test("desktop task actions require an explicit target", async () => {
  let createCalls = 0;
  let fetchCalls = 0;
  const context = actionContext({
    terminals: [{ id: "one", ptyStatus: "running" }],
    createTerminal() {
      createCalls += 1;
      return null;
    },
    fetch: async () => {
      fetchCalls += 1;
      return jsonResponse({ status: "written-to-child" });
    }
  });

  const summary = await context.runDesktopActions([{
    type: "run_terminal_tasks",
    tasks: ["Audit the terminal page"]
  }]);

  assert.equal(summary, "The terminal task target was not specified, so no terminals were changed.");
  assert.equal(createCalls, 0);
  assert.equal(fetchCalls, 0);
});

test("desktop task actions assign jobs to existing project terminals without relaunching", async () => {
  const requests = [];
  const context = actionContext({
    terminals: [
      { id: "one", projectId: "saas", ptyStatus: "running", permissionMode: "full" },
      { id: "two", projectId: "saas", ptyStatus: "starting", permissionMode: "full" },
      { id: "other", projectId: "other-project", ptyStatus: "running" }
    ],
    createTerminal() {
      assert.fail("existing terminal assignment must not create a terminal");
    },
    fetch: async (url, options) => {
      requests.push({ url, options });
      return jsonResponse({ ok: true });
    }
  });

  const summary = await context.runDesktopActions([{
    type: "run_terminal_tasks",
    target: "existing",
    projectId: "saas",
    tasks: ["Inspect the terminal page", "Run focused terminal tests"]
  }]);

  assert.equal(context.syncCalls, 1);
  assert.equal(requests.length, 2);
  assert.deepEqual(requests.map(({ url }) => url), [
    "/desktop/pty-terminals/one/assign",
    "/desktop/pty-terminals/two/assign"
  ]);
  const firstAssignment = JSON.parse(requests[0].options.body);
  const secondAssignment = JSON.parse(requests[1].options.body);
  assert.equal(firstAssignment.prompt, "Inspect the terminal page");
  assert.equal(secondAssignment.prompt, "Run focused terminal tests");
  assert.notEqual(firstAssignment.assignmentId, secondAssignment.assignmentId);
  assert.equal(summary, "Assigned 2 terminal jobs to the open terminals.");
});

test("desktop task actions target exact latest-batch IDs in supplied order", async () => {
  const requests = [];
  const records = [];
  const context = actionContext({
    activeTerminalId: "old-active",
    terminals: [
      { id: "old-active", projectId: "old-project", ptyStatus: "running" },
      { id: "new-1", projectId: "batch-project", ptyStatus: "running" },
      { id: "old-2", projectId: "batch-project", ptyStatus: "running" },
      { id: "new-2", projectId: "batch-project", ptyStatus: "running" }
    ],
    fetch: async (url, options) => {
      const body = JSON.parse(options.body);
      requests.push({ url, body });
      return jsonResponse({
        assignment: {
          assignmentId: body.assignmentId,
          terminalId: url.includes("new-2") ? "new-2" : "new-1",
          state: "written-to-child",
          providerState: "ready"
        }
      });
    },
    recordDesktopActionExecution: (scope, details) => records.push({ scope, details })
  });

  const summary = await context.runDesktopActions([{
    type: "run_terminal_tasks",
    target: "latest_batch",
    latestBatchTerminalIds: ["new-2", "new-1"],
    projectId: "stale-project",
    tasks: ["Inspect rendering", "Review accessibility"]
  }], { desktopActionContextScope: "chat:test" });

  assert.deepEqual(requests.map((request) => request.url), [
    "/desktop/pty-terminals/new-2/assign",
    "/desktop/pty-terminals/new-1/assign"
  ]);
  assert.deepEqual(requests.map((request) => request.body.prompt), [
    "Inspect rendering",
    "Review accessibility"
  ]);
  assert.equal(summary, "Assigned 2 terminal jobs to the open terminals.");
  assert.equal(records[0].scope, "chat:test");
  assert.equal(records[0].details.executionStatus, "completed");
  assert.deepEqual(JSON.parse(JSON.stringify(records[0].details.terminalIds)), ["new-2", "new-1"]);
});

test("desktop latest-batch targeting fails closed when no IDs are available", async () => {
  let fetchCalls = 0;
  const context = actionContext({
    terminals: [{ id: "older", projectId: "saas", ptyStatus: "running" }],
    fetch: async () => {
      fetchCalls += 1;
      return jsonResponse({ status: "written-to-child" });
    }
  });

  const summary = await context.runDesktopActions([{
    type: "run_terminal_tasks",
    target: "latest_batch",
    latestBatchTerminalIds: [],
    tasks: ["Do not send this to an older terminal"]
  }]);

  assert.equal(summary, "The requested terminal batch is no longer available, so no tasks were assigned.");
  assert.equal(fetchCalls, 0);
});

test("desktop task assignments preserve internal delivery callbacks", async () => {
  const events = [];
  const terminal = { id: "one", projectId: "saas", ptyStatus: "running" };
  const context = actionContext({
    terminals: [terminal],
    terminalTaskActivityStart: (target, prompt) => events.push(["start", target.id, prompt]),
    terminalTaskActivityAccepted: (target) => events.push(["accepted", target.id]),
    terminalTaskActivityFailed: (target) => events.push(["failed", target.id]),
    fetch: async () => jsonResponse({ ok: true })
  });

  await context.runDesktopActions([{
    type: "run_terminal_tasks",
    target: "existing",
    projectId: "saas",
    tasks: ["Review the terminal activity UI"]
  }]);

  assert.deepEqual(JSON.parse(JSON.stringify(events)), [
    ["start", "one", "Review the terminal activity UI"],
    ["accepted", "one"]
  ]);
});

test("desktop task assignments report semantic endpoint failures without raw-input retries", async () => {
  let attempts = 0;
  const terminal = { id: "one", projectId: "saas", ptyStatus: "starting" };
  const context = actionContext({
    terminals: [terminal],
    setTimeout: (callback) => callback(),
    fetch: async () => {
      attempts += 1;
      return jsonResponse({ status: "rejected", error: "Terminal is not ready." }, 409);
    }
  });

  const summary = await context.runDesktopActions([{
    type: "run_terminal_tasks",
    target: "existing",
    projectId: "saas",
    tasks: ["Review the terminal UI"]
  }]);

  assert.equal(attempts, 1);
  assert.equal(summary, "Assigned 0 terminal jobs to the open terminals. 1 assignment could not be delivered.");
});

test("desktop task assignments exclude shell and incompatible existing terminals", async () => {
  const requests = [];
  const context = actionContext({
    terminals: [
      { id: "shell", agent: "shell", model: "gpt-5.5", projectId: "saas", ptyStatus: "running", permissionMode: "full" },
      { id: "standard", agent: "codex", model: "gpt-5.5", projectId: "saas", ptyStatus: "running", permissionMode: "standard" },
      { id: "other-model", agent: "codex", model: "gpt-5-codex", projectId: "saas", ptyStatus: "running", permissionMode: "full" },
      { id: "match", agent: "codex", model: "gpt-5.5", projectId: "saas", ptyStatus: "running", permissionMode: "full" }
    ],
    fetch: async (url) => {
      requests.push(url);
      return jsonResponse({ ok: true });
    }
  });

  const summary = await context.runDesktopActions([{
    type: "run_terminal_tasks",
    target: "existing",
    model: "gpt-5.5",
    permissionMode: "full",
    projectId: "saas",
    tasks: ["Audit one", "Audit two"]
  }]);

  assert.deepEqual(requests, ["/desktop/pty-terminals/match/assign"]);
  assert.match(summary, /1 task had no compatible running terminal/);
});

test("desktop task actions send semantic multiline prompts without renderer formatting", async () => {
  const requests = [];
  const context = actionContext({
    terminals: [{ id: "one", agent: "vibyra", projectId: "saas", ptyStatus: "running" }],
    fetch: async (url, options) => {
      requests.push({ url, options });
      return jsonResponse({ ok: true });
    }
  });

  await context.runDesktopActions([{
    type: "run_terminal_tasks",
    target: "existing",
    projectId: "saas",
    tasks: [{ prompt: "Role: investigator\nInspect the picker\nRun focused tests" }]
  }]);

  assert.equal(
    JSON.parse(requests[0].options.body).prompt,
    "Role: investigator\nInspect the picker\nRun focused tests"
  );
});

test("desktop task actions assign only three jobs when seven terminals are open", async () => {
  const requests = [];
  const context = actionContext({
    activeTerminalId: "terminal-4",
    terminals: Array.from({ length: 7 }, (_, index) => ({
      id: `terminal-${index + 1}`,
      projectId: "saas",
      ptyStatus: "running"
    })),
    fetch: async (url, options) => {
      requests.push({ url, options });
      return jsonResponse({ ok: true });
    }
  });

  const summary = await context.runDesktopActions([{
    type: "run_terminal_tasks",
    target: "existing",
    projectId: "saas",
    tasks: ["Inspect errors", "Run tests", "Review code paths"]
  }]);

  assert.equal(requests.length, 3);
  assert.deepEqual(requests.map(({ url }) => url), [
    "/desktop/pty-terminals/terminal-4/assign",
    "/desktop/pty-terminals/terminal-1/assign",
    "/desktop/pty-terminals/terminal-2/assign"
  ]);
  assert.equal(summary, "Assigned 3 terminal jobs to the open terminals.");
});

test("desktop subagent additions require explicit user-approved open-more intent", async () => {
  const requests = [];
  const created = [];
  const context = actionContext({
    terminals: Array.from({ length: 5 }, (_, index) => ({
      id: `existing-${index + 1}`,
      model: "gpt-5.5",
      effort: "medium",
      permissionMode: "full",
      projectId: "saas",
      ptyStatus: "running",
      tokenMode: "provider"
    })),
    createTerminal(model, shouldRender, options) {
      const terminal = { id: `new-${created.length + 1}`, model, ...options };
      created.push(terminal);
      context.terminals.unshift(terminal);
      return terminal;
    },
    fetch: async (url, options) => {
      requests.push({ url, options });
      return jsonResponse({ ok: true });
    }
  });

  const summary = await context.runDesktopActions([{
    type: "run_terminal_tasks",
    target: "existing_then_new",
    allowOpenMore: true,
    projectId: "saas",
    tasks: Array.from({ length: 8 }, (_, index) => `Task ${index + 1}`)
  }]);

  assert.equal(requests.length, 5);
  assert.equal(created.length, 3);
  assert.equal(context.terminals.length, 8);
  assert.equal(created.every((terminal) => terminal.permissionMode === "standard"), true);
  assert.equal(created.every((terminal) => terminal.tokenMode === "provider"), true);
  assert.equal(summary, "Assigned 5 terminal jobs to the open terminals. Started 3 additional terminal jobs.");
});

test("desktop task delivery failures never open replacement terminals without approval", async () => {
  let createCalls = 0;
  const records = [];
  const context = actionContext({
    terminals: [{ id: "existing-1", projectId: "saas", ptyStatus: "running" }],
    createTerminal() {
      createCalls += 1;
      return { id: `unexpected-${createCalls}` };
    },
    recordDesktopActionExecution: (scope, details) => records.push({ scope, details }),
    fetch: async () => jsonResponse({ status: "rejected", error: "Provider is busy." }, 409)
  });

  const summary = await context.runDesktopActions([{
    type: "run_terminal_tasks",
    target: "existing_then_new",
    projectId: "saas",
    tasks: ["Audit the terminal page", "Run focused tests"]
  }], { desktopActionContextScope: "chat:test" });

  assert.equal(createCalls, 0);
  assert.equal(summary, "Assigned 0 terminal jobs to the open terminals. 1 assignment could not be delivered. 1 task had no compatible running terminal.");
  assert.equal(records.length, 1);
  assert.equal(records[0].scope, "chat:test");
  assert.equal(records[0].details.executionStatus, "partial");
  assert.deepEqual(JSON.parse(JSON.stringify(records[0].details.terminalIds)), ["existing-1"]);
});

test("desktop new task actions record queued IDs without claiming delivery", async () => {
  const records = [];
  const context = actionContext({
    createTerminal(model, shouldRender, options) {
      const terminal = { id: `queued-${context.terminals.length + 1}`, model, ...options };
      context.terminals.unshift(terminal);
      return terminal;
    },
    recordDesktopActionExecution: (scope, details) => records.push({ scope, details })
  });

  const summary = await context.runDesktopActions([{
    type: "run_terminal_tasks",
    target: "new",
    model: "gpt-5.5",
    projectId: "saas",
    tasks: ["Audit one", "Audit two"]
  }], { desktopActionContextScope: "chat:test" });

  assert.match(summary, /^Queued 2 terminal tasks/);
  assert.equal(records[0].scope, "chat:test");
  assert.equal(records[0].details.executionStatus, "pending");
  assert.deepEqual(JSON.parse(JSON.stringify(records[0].details.terminalIds)), ["queued-1", "queued-2"]);
});

test("desktop actions close every authoritative terminal in one request", async () => {
  const context = actionContext({
    terminals: [{ id: "one", pending: true }, { id: "two" }],
    fetch: async (url, options) => {
      assert.equal(url, "/desktop/pty-terminals/close-all");
      assert.equal(options.method, "POST");
      return jsonResponse({ ok: true, closed: 2 });
    }
  });

  const summary = await context.runDesktopActions([{
    type: "close_terminals",
    scope: "all",
    terminalId: ""
  }]);

  assert.equal(context.syncCalls, 1);
  assert.deepEqual(context.removed, ["one", "two"]);
  assert.equal(context.terminals.length, 0);
  assert.equal(summary, "Closed 2 terminals.");
});

test("desktop actions relaunch all Codex terminals with full permissions", async () => {
  const created = [];
  const context = actionContext({
    activeTerminalId: "two",
    terminals: [
      { id: "one", title: "GPT-5.5 1", model: "gpt-5.5", effort: "high", permissionMode: "standard", projectId: "saas", tokenMode: "provider" },
      { id: "two", title: "GPT-5.5 2", model: "gpt-5.5", effort: "xhigh", permissionMode: "standard", projectId: "saas", tokenMode: "vibyra" }
    ],
    createTerminal(model, shouldRender, options) {
      const terminal = { id: `new-${created.length + 1}`, model, ...options };
      created.push({ model, shouldRender, options, terminal });
      context.terminals.unshift(terminal);
      context.activeTerminalId = terminal.id;
      return terminal;
    },
    fetch: async (url, options) => {
      assert.equal(url, "/desktop/pty-terminals/close-all");
      assert.equal(options.method, "POST");
      return jsonResponse({ ok: true, closed: 2 });
    }
  });

  const summary = await context.runDesktopActions([{
    type: "set_terminal_permissions",
    scope: "all",
    permissionMode: "full",
    terminalId: ""
  }]);

  assert.equal(summary, "Relaunched 2 terminals with full access.");
  assert.equal(created.length, 2);
  assert.deepEqual(JSON.parse(JSON.stringify(created.map((item) => item.options))), [
    { effort: "xhigh", permissionMode: "full", projectId: "saas", tokenMode: "vibyra" },
    { effort: "high", permissionMode: "full", projectId: "saas", tokenMode: "provider" }
  ]);
  assert.deepEqual(context.terminals.map((terminal) => terminal.permissionMode), ["full", "full"]);
  assert.deepEqual(context.terminals.map((terminal) => terminal.tokenMode), ["provider", "vibyra"]);
  assert.equal(context.activeTerminalId, "new-1");
});

test("desktop permissions preserve OpenAI wrapper models and token sources", async () => {
  const created = [];
  let confirmation = "";
  const context = actionContext({
    activeTerminalId: "two",
    terminals: [
      { id: "one", title: "GPT-5.5 Pro 1", agent: "vibyra", model: "openai/gpt-5.5-pro", effort: "high", permissionMode: "standard", projectId: "saas", tokenMode: "provider" },
      { id: "two", title: "GPT-5.5 Pro 2", agent: "vibyra", model: "openai/gpt-5.5-pro", effort: "xhigh", permissionMode: "standard", projectId: "saas", tokenMode: "vibyra" }
    ],
    modelChoices: () => [
      { key: "gpt-5.5", label: "GPT-5.5", provider: "openai" },
      { key: "openai/gpt-5.5-pro", label: "GPT-5.5 Pro", provider: "openai" }
    ],
    createTerminal(model, shouldRender, options) {
      const terminal = { id: `new-${created.length + 1}`, agent: "vibyra", model, ...options };
      created.push({ model, shouldRender, options, terminal });
      context.terminals.unshift(terminal);
      context.activeTerminalId = terminal.id;
      return terminal;
    },
    fetch: async () => jsonResponse({ ok: true, closed: 2 }),
    window: {
      confirm(message) {
        confirmation = message;
        return true;
      }
    }
  });

  const summary = await context.runDesktopActions([{
    type: "set_terminal_permissions",
    scope: "all",
    permissionMode: "full"
  }]);

  assert.equal(summary, "Relaunched 2 terminals with full access.");
  assert.doesNotMatch(confirmation, /switch to the compatible Codex CLI model/);
  assert.deepEqual(created.map((item) => item.model), ["openai/gpt-5.5-pro", "openai/gpt-5.5-pro"]);
  assert.deepEqual(created.map((item) => item.options.tokenMode), ["vibyra", "provider"]);
  assert.deepEqual(context.terminals.map((terminal) => terminal.title), ["GPT-5.5 Pro 1", "GPT-5.5 Pro 2"]);
  assert.deepEqual(context.terminals.map((terminal) => terminal.permissionMode), ["full", "full"]);
});

test("desktop permissions relaunch Claude with its original model and token source", async () => {
  const created = [];
  const context = actionContext({
    terminals: [{
      id: "one",
      title: "Claude Sonnet",
      agent: "vibyra",
      model: "anthropic/claude-sonnet-4",
      permissionMode: "standard",
      tokenMode: "vibyra"
    }],
    modelChoices: () => [
      { key: "anthropic/claude-sonnet-4", label: "Claude Sonnet 4", provider: "claude" }
    ],
    createTerminal(model, shouldRender, options) {
      const terminal = { id: "new-claude", agent: "vibyra", model, ...options };
      created.push({ model, options });
      context.terminals.unshift(terminal);
      return terminal;
    },
    fetch: async () => {
      return jsonResponse({ ok: true, closed: 1 });
    }
  });

  const summary = await context.runDesktopActions([{
    type: "set_terminal_permissions",
    scope: "all",
    permissionMode: "full"
  }]);

  assert.equal(summary, "Relaunched 1 terminal with full access.");
  assert.equal(created[0].model, "anthropic/claude-sonnet-4");
  assert.equal(created[0].options.tokenMode, "vibyra");
  assert.equal(created[0].options.permissionMode, "full");
});

test("desktop permissions do not depend on Codex availability for provider models", async () => {
  const created = [];
  const context = actionContext({
    terminals: [{
      id: "one",
      title: "GPT-5.5 Pro",
      agent: "vibyra",
      model: "openai/gpt-5.5-pro",
      permissionMode: "standard"
    }],
    modelChoices: () => [
      { key: "gpt-5.5", label: "GPT-5.5", provider: "openai" },
      { key: "openai/gpt-5.5-pro", label: "GPT-5.5 Pro", provider: "openai" }
    ],
    providerAccounts: {
      codex: { available: false, connected: false }
    },
    createTerminal(model, shouldRender, options) {
      const terminal = { id: "new-wrapper", agent: "vibyra", model, ...options };
      created.push({ model, options });
      context.terminals.unshift(terminal);
      return terminal;
    },
    fetch: async () => {
      return jsonResponse({ ok: true, closed: 1 });
    }
  });

  const summary = await context.runDesktopActions([{
    type: "set_terminal_permissions",
    scope: "all",
    permissionMode: "full"
  }]);

  assert.equal(summary, "Relaunched 1 terminal with full access.");
  assert.equal(created[0].model, "openai/gpt-5.5-pro");
});

test("desktop permission relaunch leaves terminals open when their model is locked", async () => {
  let fetchCalls = 0;
  const context = actionContext({
    terminals: [{
      id: "one",
      model: "gpt-5.5",
      effort: "medium",
      permissionMode: "standard",
      projectId: "saas"
    }],
    modelLocked: () => true,
    fetch: async () => {
      fetchCalls += 1;
      return jsonResponse({ ok: true, closed: 1 });
    }
  });

  const summary = await context.runDesktopActions([{
    type: "set_terminal_permissions",
    scope: "all",
    permissionMode: "full"
  }]);

  assert.match(summary, /no terminals were relaunched/i);
  assert.equal(fetchCalls, 0);
  assert.equal(context.terminals.length, 1);
});

test("desktop close-all respects cancellation", async () => {
  const context = actionContext({
    terminals: [{ id: "one" }],
    window: { confirm: () => false }
  });

  const summary = await context.runDesktopActions([{
    type: "close_terminals",
    scope: "all",
    terminalId: ""
  }]);

  assert.equal(summary, "Close-all was cancelled.");
  assert.equal(context.terminals.length, 1);
});

test("desktop active-terminal close requires confirmation", async () => {
  let fetchCalls = 0;
  const context = actionContext({
    activeTerminalId: "one",
    terminals: [{ id: "one" }],
    window: { confirm: () => false },
    fetch: async () => {
      fetchCalls += 1;
      return jsonResponse({ ok: true, closed: true });
    }
  });

  const summary = await context.runDesktopActions([{
    type: "close_terminals",
    scope: "active",
    terminalId: "one"
  }]);

  assert.equal(summary, "Terminal close was cancelled.");
  assert.equal(fetchCalls, 0);
  assert.equal(context.terminals.length, 1);
});

test("desktop close does not report success for an already missing terminal", async () => {
  const context = actionContext({
    activeTerminalId: "missing",
    terminals: [{ id: "missing" }],
    fetch: async () => jsonResponse({ ok: true, closed: false, sessions: [] })
  });

  const summary = await context.runDesktopActions([{
    type: "close_terminals",
    scope: "active",
    terminalId: "missing"
  }]);

  assert.equal(summary, "That terminal was already closed.");
  assert.equal(context.syncCalls, 2);
});

function actionContext(overrides = {}) {
  const context = {
    activeTerminalId: "",
    chatModels: [],
    createTerminals() {},
    createTerminal() {
      return null;
    },
    fetch: async () => jsonResponse({ ok: true }),
    findTerminal(id) {
      return context.terminals.find((terminal) => terminal.id === id) || null;
    },
    forceTerminalRender: false,
    maxTerminals: 12,
    modelChoices: () => [
      { key: "auto", label: "Auto", provider: "auto" },
      { key: "gpt-5.5", label: "GPT-5.5", provider: "openai" }
    ],
    modelLocked: () => false,
    normalizeCount: (value) => Math.max(1, Math.min(12, Number(value) || 1)),
    openTerminalCompanionPanel() {},
    openTokenModal() {},
    removed: [],
    removeLocalPtyTerminal(terminal) {
      context.removed.push(terminal.id);
    },
    render() {},
    saveTerminals() {},
    selectedProjectId: "unrelated-project",
    setPage() {},
    settingsTerminalId: "",
    syncCalls: 0,
    async syncPtyTerminals() {
      context.syncCalls += 1;
    },
    terminalFullAccessSupported(model) {
      return String(model?.key || "").toLowerCase() !== "auto";
    },
    terminalProviderKeyForModel: (model) => model.provider,
    terminals: [],
    sendPtyInput() {},
    window: { confirm: () => true },
    ...overrides
  };
  vm.runInNewContext(source, context);
  return context;
}

function jsonResponse(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return payload;
    }
  };
}
