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

test("desktop actions do not claim full access for OpenRouter wrapper models", async () => {
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

  assert.equal(summary, "Full-access launches are currently supported only for Codex terminals.");
  assert.deepEqual(calls, []);
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
  assert.equal(summary, "Starting 2 terminal tasks on separate local Git branches in Terminals.");
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
    workspaceMode: "shared"
  });
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
    "/desktop/pty-terminals/one/input",
    "/desktop/pty-terminals/two/input"
  ]);
  assert.equal(JSON.parse(requests[0].options.body).input, "\u001b[200~Inspect the terminal page\u001b[201~\r");
  assert.equal(summary, "Assigned 2 terminal jobs to the open terminals.");
});

test("desktop task assignments expose accepted activity to the terminal UI", async () => {
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

test("desktop task assignments retry while a newly opened terminal is starting", async () => {
  let attempts = 0;
  const terminal = { id: "one", projectId: "saas", ptyStatus: "starting" };
  const context = actionContext({
    terminals: [terminal],
    setTimeout: (callback) => callback(),
    fetch: async () => {
      attempts += 1;
      return attempts < 3
        ? jsonResponse({ error: "Terminal is not running." }, 409)
        : jsonResponse({ ok: true });
    }
  });

  const summary = await context.runDesktopActions([{
    type: "run_terminal_tasks",
    target: "existing",
    projectId: "saas",
    tasks: ["Review the terminal UI"]
  }]);

  assert.equal(attempts, 3);
  assert.equal(summary, "Assigned 1 terminal job to the open terminals.");
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

  assert.deepEqual(requests, ["/desktop/pty-terminals/match/input"]);
  assert.match(summary, /1 task had no compatible running terminal/);
});

test("desktop task actions flatten multiline briefs for Vibyra wrapper terminals", async () => {
  const requests = [];
  const context = actionContext({
    terminals: [{ id: "one", agent: "vibyra", projectId: "saas", ptyStatus: "running" }],
    terminalTaskInputPrompt: (terminal, prompt) => terminal.agent === "vibyra"
      ? String(prompt).split(/\r?\n/).map((line) => line.trim()).filter(Boolean).join(" | ")
      : String(prompt),
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
    JSON.parse(requests[0].options.body).input,
    "\u001b[200~Role: investigator | Inspect the picker | Run focused tests\u001b[201~\r"
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
    "/desktop/pty-terminals/terminal-4/input",
    "/desktop/pty-terminals/terminal-1/input",
    "/desktop/pty-terminals/terminal-2/input"
  ]);
  assert.equal(summary, "Assigned 3 terminal jobs to the open terminals.");
});

test("desktop subagent retries reuse existing terminals before opening matching additions", async () => {
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

  assert.equal(summary, "Relaunched 2 Codex terminals with full access.");
  assert.equal(created.length, 2);
  assert.deepEqual(JSON.parse(JSON.stringify(created.map((item) => item.options))), [
    { effort: "xhigh", permissionMode: "full", projectId: "saas", tokenMode: "vibyra" },
    { effort: "high", permissionMode: "full", projectId: "saas", tokenMode: "provider" }
  ]);
  assert.deepEqual(context.terminals.map((terminal) => terminal.permissionMode), ["full", "full"]);
  assert.deepEqual(context.terminals.map((terminal) => terminal.tokenMode), ["provider", "vibyra"]);
  assert.equal(context.activeTerminalId, "new-1");
});

test("desktop permissions safely convert compatible OpenAI wrappers to Codex", async () => {
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
      const terminal = { id: `new-${created.length + 1}`, agent: "codex", model, ...options };
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

  assert.equal(summary, "Relaunched 2 Codex terminals with full access.");
  assert.match(confirmation, /switch to the compatible Codex CLI model/);
  assert.deepEqual(created.map((item) => item.model), ["gpt-5.5", "gpt-5.5"]);
  assert.deepEqual(created.map((item) => item.options.tokenMode), ["vibyra", "provider"]);
  assert.deepEqual(context.terminals.map((terminal) => terminal.title), ["GPT-5.5 1", "GPT-5.5 2"]);
  assert.deepEqual(context.terminals.map((terminal) => terminal.permissionMode), ["full", "full"]);
});

test("desktop permissions keep non-OpenAI wrappers blocked", async () => {
  let fetchCalls = 0;
  const context = actionContext({
    terminals: [{
      id: "one",
      title: "Claude Sonnet",
      agent: "vibyra",
      model: "anthropic/claude-sonnet-4",
      permissionMode: "standard"
    }],
    modelChoices: () => [
      { key: "anthropic/claude-sonnet-4", label: "Claude Sonnet 4", provider: "claude" }
    ],
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

  assert.equal(summary, "Full access requires a Codex-compatible OpenAI terminal.");
  assert.equal(fetchCalls, 0);
});

test("desktop permissions do not close terminals when Codex is unavailable", async () => {
  let fetchCalls = 0;
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

  assert.match(summary, /Codex CLI must be installed and signed in/);
  assert.equal(fetchCalls, 0);
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
