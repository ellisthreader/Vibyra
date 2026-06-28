import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  AUTO_DECIDING_MINIMUM_MS,
  autoTerminalDecidingHandoff,
  autoTerminalDecidingStart,
  autoTerminalDecidingStop,
  autoTerminalDecidingUpdate,
  autoTerminalPrompt,
  consumeAutoTerminalInput
} from "./aiTerminalAutoWaiting.mjs";

function git(cwd, ...args) {
  return execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8" }).trim();
}

async function waitUntil(check, timeoutMs = 3000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (check()) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  assert.fail("Timed out waiting for terminal process output.");
}

test("Auto deciding animation keeps one stable full-screen 3D V", () => {
  const first = autoTerminalDecidingStart({ cols: 72, rows: 30, phase: 0 });
  const update = autoTerminalDecidingUpdate({
    cols: 72,
    rows: 30,
    phase: 3
  });
  const next = autoTerminalDecidingUpdate({
    cols: 72,
    rows: 30,
    phase: 1
  });
  const compact = autoTerminalDecidingStart({ cols: 48, rows: 16, phase: 0 });
  const micro = autoTerminalDecidingStart({ cols: 36, rows: 10, phase: 0 });
  const stripAnsi = (value) => value.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, "");

  const firstText = stripAnsi(first.output);
  const microText = stripAnsi(micro.output);
  const firstLines = firstText.split("\r\n");
  const firstContentRow = firstLines.findIndex((line) => line.trim());
  const remainingRows = 30 - first.lineCount;

  assert.ok(first.lineCount >= 20);
  assert.equal(firstContentRow, 5);
  assert.ok(Math.abs(firstContentRow - remainingRows) <= 1);
  assert.match(firstText, /#####\\/);
  assert.match(firstText, /\+/);
  assert.match(firstText, /V I B Y R A\s+A U T O/);
  assert.match(firstText, /SELECTING THE BEST MODEL/);
  assert.match(first.output, /\x1b\[3J\x1b\[2J\x1b\[H/);
  assert.match(first.output, /\x1b\[\?25l/);
  assert.match(update, /^\x1b\[H/);
  assert.match(update, /\x1b\[2K/);
  assert.doesNotMatch(update, /\x1b7|\x1b8|\x1b\[[0-9]+A/);
  assert.equal(stripAnsi(update).length, stripAnsi(next).length);
  assert.match(stripAnsi(update), /\*|\./);
  assert.ok(compact.lineCount <= 16);
  assert.match(stripAnsi(compact.output), /####\\/);
  assert.ok(micro.lineCount <= 10);
  assert.match(microText, /VIBYRA AUTO \/\/ SELECTING MODEL/);
  assert.ok(AUTO_DECIDING_MINIMUM_MS >= 6 * 200);
  assert.equal(autoTerminalDecidingStop(), "\x1b[0m\x1b[?25h");
  assert.equal(autoTerminalDecidingHandoff(), "\x1b[0m\x1b[?25h\x1b[3J\x1b[2J\x1b[H");
});

test("PTY socket input errors are contained inside the socket handler", async () => {
  const root = mkdtempSync(join(tmpdir(), "vibyra-pty-socket-"));
  process.env.VIBYRA_TERMINAL_SESSION_ROOT = root;
  try {
    const moduleUrl = new URL(`./ptyTerminals.mjs?socket=${Date.now()}`, import.meta.url);
    const { handlePtySocketMessage } = await import(moduleUrl);
    assert.doesNotThrow(() => {
      handlePtySocketMessage("missing-terminal", JSON.stringify({ type: "input", data: "\u001b[0n" }));
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
    delete process.env.VIBYRA_TERMINAL_SESSION_ROOT;
  }
});

test("personal accounts launch official provider models and reject API-only wrappers", async () => {
  const root = mkdtempSync(join(tmpdir(), "vibyra-pty-routing-"));
  process.env.VIBYRA_TERMINAL_SESSION_ROOT = root;
  try {
    const moduleUrl = new URL(`./ptyTerminals.mjs?routing=${Date.now()}`, import.meta.url);
    const { terminalAgentForModel, terminalAgentForTokenSource } = await import(moduleUrl);

    assert.equal(terminalAgentForModel("gpt-5.5"), "codex");
    assert.equal(terminalAgentForModel("openai/gpt-5.5-pro"), "codex");
    assert.equal(terminalAgentForModel("anthropic/claude-sonnet-4.5"), "claude");
    assert.equal(terminalAgentForModel("google/gemini-3.1-pro-preview"), "gemini");
    assert.equal(terminalAgentForTokenSource("gpt-5.5", "vibyra", {}, "codex"), "vibyra");
    assert.equal(terminalAgentForTokenSource("gpt-5.5", "provider", {
      codex: { available: true, connected: true }
    }, "vibyra"), "codex");
    assert.equal(
      terminalAgentForTokenSource("openai/gpt-5.5-pro", "provider", {
        codex: { available: true, connected: true }
      }, "codex"),
      "codex"
    );
    assert.equal(
      terminalAgentForTokenSource("claude-sonnet-4", "provider", {
        claude: { available: true, connected: true }
      }, "claude"),
      "claude"
    );
    assert.equal(
      terminalAgentForTokenSource("gemini-2.5-pro", "provider", {
        gemini: { available: true, connected: true }
      }, "gemini"),
      "gemini"
    );
    assert.equal(
      terminalAgentForTokenSource("anthropic/claude-sonnet-4", "provider", {
        claude: { available: true, connected: true }
      }, "claude"),
      "claude"
    );
    assert.throws(
      () => terminalAgentForTokenSource("deepseek/deepseek-v3", "provider", {}, "vibyra"),
      /only available with Vibyra tokens/
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
    delete process.env.VIBYRA_TERMINAL_SESSION_ROOT;
  }
});

test("semantic assignment formatting preserves multiline input for real PTY runtimes", async () => {
  const root = mkdtempSync(join(tmpdir(), "vibyra-pty-assignment-format-"));
  process.env.VIBYRA_TERMINAL_SESSION_ROOT = root;
  try {
    const moduleUrl = new URL(`./ptyTerminals.mjs?assignmentFormat=${Date.now()}`, import.meta.url);
    const { formatPtyTerminalAssignment } = await import(moduleUrl);

    assert.equal(
      formatPtyTerminalAssignment("codex", "Inspect this\nthen test it"),
      "\u001b[200~Inspect this\rthen test it\u001b[201~\r"
    );
    assert.equal(
      formatPtyTerminalAssignment("vibyra", "Inspect this\n\nthen test it"),
      "\u001b[200~Inspect this\r\rthen test it\u001b[201~\r"
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
    delete process.env.VIBYRA_TERMINAL_SESSION_ROOT;
  }
});

test("concrete Vibyra-credit terminals require a desktop account session", async () => {
  const root = mkdtempSync(join(tmpdir(), "vibyra-pty-account-required-"));
  process.env.VIBYRA_TERMINAL_SESSION_ROOT = root;
  const { appState } = await import("./state.mjs");
  const previousToken = appState.desktopAccountToken;
  appState.desktopAccountToken = null;
  try {
    const moduleUrl = new URL(`./ptyTerminals.mjs?accountRequired=${Date.now()}`, import.meta.url);
    const { createPtyTerminal } = await import(moduleUrl);
    await assert.rejects(
      () => createPtyTerminal({
        id: "managed-account-required",
        agent: "vibyra",
        model: "openai/gpt-5.5",
        tokenMode: "vibyra"
      }),
      (error) => error?.status === 401 && /Log in to Vibyra Desktop/.test(error.message)
    );
  } finally {
    appState.desktopAccountToken = previousToken;
    rmSync(root, { recursive: true, force: true });
    delete process.env.VIBYRA_TERMINAL_SESSION_ROOT;
  }
});

test("Vibyra-funded terminal creation enforces the account concurrency limit", async () => {
  const root = mkdtempSync(join(tmpdir(), "vibyra-pty-membership-cap-"));
  process.env.VIBYRA_TERMINAL_SESSION_ROOT = root;
  const { appState } = await import("./state.mjs");
  const previousAccount = appState.desktopAccount;
  const previousToken = appState.desktopAccountToken;
  appState.desktopAccount = { id: 1, plan: "starter", maxConcurrentAgents: 1 };
  appState.desktopAccountToken = "account-token";
  try {
    const moduleUrl = new URL(`./ptyTerminals.mjs?membershipCap=${Date.now()}`, import.meta.url);
    const { closeAllPtyTerminals, createPtyTerminal } = await import(moduleUrl);
    await createPtyTerminal({
      id: "membership-cap-first",
      model: "auto",
      tokenMode: "vibyra"
    });

    await assert.rejects(
      createPtyTerminal({
        id: "membership-cap-second",
        model: "auto",
        tokenMode: "vibyra"
      }),
      (error) => error?.status === 403 && /supports 1 concurrent agent/.test(error.message)
    );
    closeAllPtyTerminals();
  } finally {
    appState.desktopAccount = previousAccount;
    appState.desktopAccountToken = previousToken;
    rmSync(root, { recursive: true, force: true });
    delete process.env.VIBYRA_TERMINAL_SESSION_ROOT;
  }
});

test("parallel project-bound Vibyra terminal launches cannot race past the cap", async () => {
  const root = mkdtempSync(join(tmpdir(), "vibyra-pty-membership-race-"));
  process.env.VIBYRA_TERMINAL_SESSION_ROOT = root;
  const { appState } = await import("./state.mjs");
  const previousAccount = appState.desktopAccount;
  const previousToken = appState.desktopAccountToken;
  const previousProjects = appState.cachedProjects;
  const previousPath = process.env.PATH;
  const previousFetch = global.fetch;
  appState.desktopAccount = { id: 1, plan: "starter", maxConcurrentAgents: 1 };
  appState.desktopAccountToken = "account-token";
  appState.cachedProjects = [{ id: "membership-race-project", name: "Race", path: root }];
  process.env.PATH = "";
  global.fetch = async () => {
    await new Promise((resolve) => setTimeout(resolve, 40));
    return {
      ok: true,
      status: 200,
      async json() { return { ok: true, vault: { nodes: [] } }; }
    };
  };
  try {
    const moduleUrl = new URL(`./ptyTerminals.mjs?membershipRace=${Date.now()}`, import.meta.url);
    const { closeAllPtyTerminals, createPtyTerminal } = await import(moduleUrl);
    const results = await Promise.allSettled([
      createPtyTerminal({
        id: "membership-race-first",
        model: "openai/gpt-5.5",
        tokenMode: "vibyra",
        projectId: "membership-race-project"
      }),
      createPtyTerminal({
        id: "membership-race-second",
        model: "openai/gpt-5.5",
        tokenMode: "vibyra",
        projectId: "membership-race-project"
      })
    ]);

    assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
    assert.equal(results.filter((result) => (
      result.status === "rejected"
      && result.reason?.status === 403
      && /supports 1 concurrent agent/.test(result.reason.message)
    )).length, 1);
    closeAllPtyTerminals();
  } finally {
    appState.desktopAccount = previousAccount;
    appState.desktopAccountToken = previousToken;
    appState.cachedProjects = previousProjects;
    process.env.PATH = previousPath;
    global.fetch = previousFetch;
    rmSync(root, { recursive: true, force: true });
    delete process.env.VIBYRA_TERMINAL_SESSION_ROOT;
  }
});

test("PTY Team launch canonicalizes legacy identifiers before starting the provider", async () => {
  const root = mkdtempSync(join(tmpdir(), "vibyra-pty-team-id-"));
  const cli = fakeProviderCli(root, "codex");
  const { appState } = await import("./state.mjs");
  const previousToken = appState.desktopAccountToken;
  process.env.VIBYRA_TERMINAL_SESSION_ROOT = join(root, "sessions");
  process.env.VIBYRA_AGENT_HOME = join(root, "agent-home");
  process.env.VIBYRA_CODEX_CLI = cli;
  appState.desktopAccountToken = "account-token";
  try {
    const moduleUrl = new URL(`./ptyTerminals.mjs?teamId=${Date.now()}`, import.meta.url);
    const { closePtyTerminal, createPtyTerminal } = await import(moduleUrl);
    const { persistentTerminalPaths } = await import("./aiTerminalPersistentProcess.mjs");
    const session = await createPtyTerminal({
      id: "legacy-team-reviewer",
      agent: "vibyra",
      model: "openai/gpt-5.5",
      tokenMode: "vibyra",
      permissionMode: "full",
      teamId: "550e8400-e29b-41d4-a716-446655440000",
      teamSize: 2,
      teamGoal: "Review the terminal launch path.",
      teamRoleKey: "reviewer"
    });

    assert.match(session.teamId, /^team-[a-f0-9]{24}$/);
    assert.equal(session.teamRoleKey, "reviewer");
    assert.equal(session.teamCapability, "read-only");
    assert.equal(session.permissionMode, "standard");
    assert.equal(session.launchPlan.sandboxMode, "read-only");

    closePtyTerminal(session.id);
    await waitUntil(() => !existsSync(persistentTerminalPaths(session.id).dir), 5000);
  } finally {
    appState.desktopAccountToken = previousToken;
    rmSync(root, { recursive: true, force: true });
    delete process.env.VIBYRA_TERMINAL_SESSION_ROOT;
    delete process.env.VIBYRA_AGENT_HOME;
    delete process.env.VIBYRA_CODEX_CLI;
  }
});

test("aggregate Team launch removes every session when a later member fails", async () => {
  const root = mkdtempSync(join(tmpdir(), "vibyra-pty-team-rollback-"));
  const cli = fakeProviderCli(root, "codex");
  const { appState } = await import("./state.mjs");
  const previousToken = appState.desktopAccountToken;
  process.env.VIBYRA_TERMINAL_SESSION_ROOT = join(root, "sessions");
  process.env.VIBYRA_AGENT_HOME = join(root, "agent-home");
  process.env.VIBYRA_CODEX_CLI = cli;
  appState.desktopAccountToken = "account-token";
  try {
    const moduleUrl = new URL(`./ptyTerminals.mjs?teamRollback=${Date.now()}`, import.meta.url);
    const { launchPtyTerminalTeam, listPtyTerminals } = await import(moduleUrl);
    const { persistentTerminalPaths } = await import("./aiTerminalPersistentProcess.mjs");
    await assert.rejects(
      () => launchPtyTerminalTeam([
        {
          id: "rollback-team-builder",
          title: "Builder",
          agent: "vibyra",
          model: "openai/gpt-5.5",
          tokenMode: "vibyra",
          teamId: "team-rollback-1234",
          teamSize: 2,
          teamGoal: "Verify atomic Team launch.",
          teamRoleKey: "builder"
        },
        {
          id: "rollback-team-reviewer",
          title: "Reviewer",
          agent: "vibyra",
          model: "openai/gpt-5.5",
          tokenMode: "vibyra",
          projectId: "missing-project",
          teamId: "team-rollback-1234",
          teamSize: 2,
          teamGoal: "Verify atomic Team launch.",
          teamRoleKey: "reviewer"
        }
      ]),
      /different launch settings/i
    );
    assert.equal(listPtyTerminals().length, 0);
    await waitUntil(() => !existsSync(persistentTerminalPaths("rollback-team-builder").dir), 5000);
  } finally {
    appState.desktopAccountToken = previousToken;
    rmSync(root, { recursive: true, force: true });
    delete process.env.VIBYRA_TERMINAL_SESSION_ROOT;
    delete process.env.VIBYRA_AGENT_HOME;
    delete process.env.VIBYRA_CODEX_CLI;
  }
});

test("API-only models launch Vibyra Agent with an exact terminal gateway grant", async () => {
  const root = mkdtempSync(join(tmpdir(), "vibyra-pty-api-agent-"));
  const engine = fakeProviderCli(root, "codex");
  const { appState } = await import("./state.mjs");
  const previousToken = appState.desktopAccountToken;
  process.env.VIBYRA_TERMINAL_SESSION_ROOT = join(root, "sessions");
  process.env.VIBYRA_AGENT_HOME = join(root, "agent-home");
  process.env.VIBYRA_CODEX_CLI = engine;
  appState.desktopAccountToken = "account-token";
  try {
    const moduleUrl = new URL(`./ptyTerminals.mjs?apiAgent=${Date.now()}`, import.meta.url);
    const { closePtyTerminal, createPtyTerminal } = await import(moduleUrl);
    const { persistentTerminalPaths } = await import("./aiTerminalPersistentProcess.mjs");
    const { verifyTerminalGatewayToken } = await import("./terminalGatewayAuth.mjs");
    const session = await createPtyTerminal({
      id: "deepseek-vibyra-agent",
      agent: "vibyra",
      model: "deepseek/deepseek-v3.2",
      tokenMode: "vibyra"
    });
    const config = JSON.parse(readFileSync(
      persistentTerminalPaths(session.id).config,
      "utf8"
    ));
    const registryPath = join(process.env.VIBYRA_AGENT_HOME, "terminal-gateway-auth.json");

    assert.equal(session.launchPlan.runtimeId, "vibyra-agent");
    assert.equal(session.launchPlan.providerId, "deepseek");
    assert.equal(session.launchPlan.adapterId, "responses");
    assert.equal(session.launchPlan.billingModel, "deepseek/deepseek-v3.2");
    assert.equal(verifyTerminalGatewayToken(config.terminalGatewayToken, {
      registryPath,
      model: "deepseek/deepseek-v3.2",
      runtimeId: "vibyra-agent",
      providerId: "deepseek",
      adapterId: "responses",
      protocol: "openai-responses",
      nativeModel: "deepseek/deepseek-v3.2",
      billingModel: "deepseek/deepseek-v3.2",
      consume: false
    })?.terminalId, session.id);

    closePtyTerminal(session.id);
    assert.equal(verifyTerminalGatewayToken(config.terminalGatewayToken, {
      registryPath,
      model: "deepseek/deepseek-v3.2",
      consume: false
    }), null);
    await waitUntil(() => !existsSync(persistentTerminalPaths(session.id).dir), 5000);
  } finally {
    appState.desktopAccountToken = previousToken;
    rmSync(root, { recursive: true, force: true });
    delete process.env.VIBYRA_TERMINAL_SESSION_ROOT;
    delete process.env.VIBYRA_AGENT_HOME;
    delete process.env.VIBYRA_CODEX_CLI;
  }
});

test("blank Auto input echoes locally and yields the first task on Enter", () => {
  const typed = consumeAutoTerminalInput({}, "Fix the terminak");
  const corrected = consumeAutoTerminalInput(typed, "\x7fl\r");

  assert.equal(typed.output, "Fix the terminak");
  assert.equal(corrected.output, "\b \bl\r\n");
  assert.equal(corrected.prompt, "Fix the terminal");
  assert.match(autoTerminalPrompt(), /auto/);
});

test("blank Auto opens first, then routes in the same session and submits once", async () => {
  const root = mkdtempSync(join(tmpdir(), "vibyra-pty-auto-native-"));
  const argsPath = join(root, "args.txt");
  const promptPath = join(root, "prompt.txt");
  const cli = fakeAutoProviderCli(root, "codex", argsPath, promptPath);
  const previousFetch = global.fetch;
  const { appState } = await import("./state.mjs");
  const previousToken = appState.desktopAccountToken;
  process.env.VIBYRA_TERMINAL_SESSION_ROOT = join(root, "sessions");
  process.env.VIBYRA_CODEX_CLI = cli;
  process.env.VIBYRA_AUTO_ARGS_PATH = argsPath;
  process.env.VIBYRA_AUTO_PROMPT_PATH = promptPath;
  appState.desktopAccountToken = "account-token";
  global.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    assert.ok(body.allowedProviders.includes("openai"));
    assert.ok(body.allowedProviders.every((provider) => (
      ["openai", "anthropic", "google", "qwen", "moonshot", "mistral", "x-ai"].includes(provider)
    )));
    return {
      ok: true,
      status: 200,
      async json() {
        return {
          ok: true,
          modelKey: "openai/gpt-5.5",
          autoRouting: {
            category: "agentic_coding",
            modelKey: "openai/gpt-5.5",
            preferredModelKey: "openai/gpt-5.5",
            allowedProviders: body.allowedProviders,
            reason: "Agentic coding"
          }
        };
      }
    };
  };

  try {
    const moduleUrl = new URL(`./ptyTerminals.mjs?autoNative=${Date.now()}`, import.meta.url);
    const {
      assignPtyTerminalTask,
      closePtyTerminal,
      createPtyTerminal,
      listPtyTerminals
    } = await import(moduleUrl);
    const session = await createPtyTerminal({
      id: "auto-native-terminal",
      title: "Alex",
      agent: "vibyra",
      model: "auto",
      tokenMode: "vibyra"
    });
    assert.equal(session.model, "auto");
    assert.equal(session.autoAwaitingTask, true);
    assert.equal(session.autoDeciding, false);
    assert.equal(session.projectId, "");
    assert.equal(session.workspaceMode, "shared");
    assert.equal(session.launchPlan, null);
    assert.match(session.output, /VIBYRA/);
    assert.match(session.output, /auto/);

    const decidingStartedAt = Date.now();
    const assignmentPromise = assignPtyTerminalTask(session.id, {
      assignmentId: "auto-job-1",
      prompt: "Implement the terminal fix."
    });
    await waitUntil(() => {
      const decidingSession = listPtyTerminals().find((item) => item.id === session.id);
      return decidingSession?.autoAwaitingTask === false
        && decidingSession?.autoDeciding === true;
    });
    const assignment = await assignmentPromise;
    await waitUntil(() => existsSync(argsPath) && existsSync(promptPath));
    await waitUntil(() => {
      const visibleSession = listPtyTerminals().find((item) => item.id === session.id);
      return visibleSession?.autoDeciding === false;
    });

    const routedSession = listPtyTerminals().find((item) => item.id === session.id);
    assert.equal(routedSession.model, "openai/gpt-5.5");
    assert.equal(routedSession.requestedModel, "auto");
    assert.equal(routedSession.autoAwaitingTask, false);
    assert.equal(routedSession.autoDeciding, false);
    assert.ok(Date.now() - decidingStartedAt >= AUTO_DECIDING_MINIMUM_MS - 100);
    assert.match(routedSession.output, /^\x1b\[0m\x1b\[\?25h\x1b\[3J\x1b\[2J\x1b\[H/);
    assert.doesNotMatch(routedSession.output, /SELECTING THE BEST MODEL/);
    assert.doesNotMatch(routedSession.output, /V I B Y R A\s+A U T O/);
    assert.match(routedSession.output, /Write tests for @filename/);
    assert.equal(routedSession.title, "Alex");
    assert.equal(routedSession.launchPlan.runtimeId, "codex");
    assert.equal(routedSession.launchPlan.providerId, "openai");
    assert.equal(assignment.state, "written-to-child");
    const invocations = readFileSync(argsPath, "utf8");
    assert.match(invocations, /--model openai\/gpt-5\.5/);
    assert.doesNotMatch(invocations, /aiTerminalOpenRouterCli|--model auto/);
    assert.match(readFileSync(promptPath, "utf8"), /Implement the terminal fix\./);
    closePtyTerminal(session.id);
  } finally {
    global.fetch = previousFetch;
    appState.desktopAccountToken = previousToken;
    rmSync(root, { recursive: true, force: true });
    delete process.env.VIBYRA_TERMINAL_SESSION_ROOT;
    delete process.env.VIBYRA_CODEX_CLI;
    delete process.env.VIBYRA_AUTO_ARGS_PATH;
    delete process.env.VIBYRA_AUTO_PROMPT_PATH;
  }
});

test("shell PTY sessions reject semantic AI assignments", async () => {
  const root = mkdtempSync(join(tmpdir(), "vibyra-pty-shell-assignment-"));
  process.env.VIBYRA_TERMINAL_SESSION_ROOT = root;
  try {
    const moduleUrl = new URL(`./ptyTerminals.mjs?shellAssignment=${Date.now()}`, import.meta.url);
    const { assignPtyTerminalTask, closeAllPtyTerminals, createPtyTerminal } = await import(moduleUrl);
    await createPtyTerminal({ id: "shell-assignment", agent: "shell", title: "Shell" });

    const result = await assignPtyTerminalTask("shell-assignment", {
      assignmentId: "job-shell",
      prompt: "This must not be pasted into Bash."
    });

    assert.equal(result.state, "rejected");
    assert.equal(result.providerState, "fallback-shell");
    assert.match(result.reason, /project shell/i);
    closeAllPtyTerminals();
  } finally {
    rmSync(root, { recursive: true, force: true });
    delete process.env.VIBYRA_TERMINAL_SESSION_ROOT;
  }
});

test("official terminal Memory stays out of public PTY session payloads", async () => {
  const root = mkdtempSync(join(tmpdir(), "vibyra-pty-memory-private-"));
  process.env.VIBYRA_TERMINAL_SESSION_ROOT = root;
  const previousPath = process.env.PATH;
  const previousFetch = global.fetch;
  const { appState } = await import("./state.mjs");
  const previousProjects = appState.cachedProjects;
  const previousToken = appState.desktopAccountToken;
  const cli = fakeProviderCli(root, "codex");
  process.env.VIBYRA_CODEX_CLI = cli;
  appState.cachedProjects = [{ id: "project-memory", name: "Memory", path: root }];
  appState.desktopAccountToken = "account-token";
  process.env.PATH = "";
  global.fetch = async () => ({
    ok: true,
    status: 200,
    async json() {
      return {
        ok: true,
        vault: {
          nodes: [{ id: "note", type: "document", name: "Context.md", markdown: "Private terminal context" }]
        }
      };
    }
  });
  try {
    const moduleUrl = new URL(`./ptyTerminals.mjs?memoryPrivate=${Date.now()}`, import.meta.url);
    const { closeAllPtyTerminals, createPtyTerminal } = await import(moduleUrl);
    const session = await createPtyTerminal({
      id: "private-memory-terminal",
      agent: "vibyra",
      model: "openai/gpt-5.5",
      projectId: "project-memory"
    });
    assert.equal("memoryInstructions" in session, false);
    closeAllPtyTerminals();
  } finally {
    appState.cachedProjects = previousProjects;
    appState.desktopAccountToken = previousToken;
    process.env.PATH = previousPath;
    global.fetch = previousFetch;
    rmSync(root, { recursive: true, force: true });
    delete process.env.VIBYRA_TERMINAL_SESSION_ROOT;
    delete process.env.VIBYRA_CODEX_CLI;
  }
});

test("Vibyra gateway credentials stay private and are revoked on close", async () => {
  const root = mkdtempSync(join(tmpdir(), "vibyra-pty-gateway-private-"));
  const cli = fakeProviderCli(root, "codex");
  const { appState } = await import("./state.mjs");
  const previousToken = appState.desktopAccountToken;
  process.env.VIBYRA_TERMINAL_SESSION_ROOT = join(root, "sessions");
  process.env.VIBYRA_AGENT_HOME = join(root, "agent-home");
  process.env.VIBYRA_CODEX_CLI = cli;
  appState.desktopAccountToken = "account-token";
  try {
    const moduleUrl = new URL(`./ptyTerminals.mjs?gatewayPrivate=${Date.now()}`, import.meta.url);
    const { closePtyTerminal, createPtyTerminal } = await import(moduleUrl);
    const { persistentTerminalPaths } = await import("./aiTerminalPersistentProcess.mjs");
    const { verifyTerminalGatewayToken } = await import("./terminalGatewayAuth.mjs");
    const session = await createPtyTerminal({
      id: "private-gateway-terminal",
      agent: "vibyra",
      model: "openai/gpt-5.5"
    });
    const config = JSON.parse(readFileSync(
      persistentTerminalPaths(session.id).config,
      "utf8"
    ));
    const registryPath = join(process.env.VIBYRA_AGENT_HOME, "terminal-gateway-auth.json");

    assert.equal("terminalGatewayToken" in session, false);
    assert.match(config.terminalGatewayToken, /^vibyra-terminal-/);
    assert.equal(verifyTerminalGatewayToken(config.terminalGatewayToken, {
      registryPath,
      model: "openai/gpt-5.5",
      runtimeId: "codex",
      providerId: "openai",
      adapterId: "responses",
      protocol: "openai-responses",
      nativeModel: "openai/gpt-5.5",
      billingModel: "openai/gpt-5.5",
      consume: false
    })?.terminalId, session.id);
    closePtyTerminal(session.id);
    assert.equal(verifyTerminalGatewayToken(config.terminalGatewayToken, {
      registryPath,
      model: "openai/gpt-5.5",
      consume: false
    }), null);
    await waitUntil(() => !existsSync(persistentTerminalPaths(session.id).dir), 10_000);
  } finally {
    appState.desktopAccountToken = previousToken;
    rmSync(root, { recursive: true, force: true });
    delete process.env.VIBYRA_TERMINAL_SESSION_ROOT;
    delete process.env.VIBYRA_AGENT_HOME;
    delete process.env.VIBYRA_CODEX_CLI;
  }
});

test("close all removes every PTY session regardless of status", async () => {
  const root = mkdtempSync(join(tmpdir(), "vibyra-pty-close-all-"));
  process.env.VIBYRA_TERMINAL_SESSION_ROOT = root;
  try {
    const moduleUrl = new URL(`./ptyTerminals.mjs?closeAll=${Date.now()}`, import.meta.url);
    const { closeAllPtyTerminals, createPtyTerminal, listPtyTerminals } = await import(moduleUrl);
    closeAllPtyTerminals();
    await createPtyTerminal({ id: "shell-1", agent: "shell", title: "One" });
    await createPtyTerminal({ id: "shell-2", agent: "shell", title: "Two" });

    assert.equal(listPtyTerminals().length, 2);
    assert.equal(closeAllPtyTerminals(), 2);
    assert.deepEqual(listPtyTerminals(), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
    delete process.env.VIBYRA_TERMINAL_SESSION_ROOT;
  }
});

test("exited persisted PTY sessions are removed instead of restored", async () => {
  const root = mkdtempSync(join(tmpdir(), "vibyra-pty-exited-restore-"));
  process.env.VIBYRA_TERMINAL_SESSION_ROOT = root;
  try {
    const terminalId = "exited-restore";
    const persistentModuleUrl = new URL(`./aiTerminalPersistentProcess.mjs?exitedRestoreState=${Date.now()}`, import.meta.url);
    const { persistentTerminalPaths } = await import(persistentModuleUrl);
    const paths = persistentTerminalPaths(terminalId);
    mkdirSync(paths.dir, { recursive: true });
    writeFileSync(paths.config, JSON.stringify({
      runtimeVersion: 18,
      terminalId,
      title: "Exited restore",
      agent: "shell",
      model: "",
      requestedModel: "",
      cwd: process.cwd(),
      cols: 100,
      rows: 30,
      tokenMode: "vibyra",
      projectId: ""
    }));
    writeFileSync(paths.state, JSON.stringify({
      status: "exited",
      providerState: "exited",
      exitCode: 0
    }));
    writeFileSync(paths.output, "old exited terminal");

    const moduleUrl = new URL(`./ptyTerminals.mjs?exitedRestore=${Date.now()}`, import.meta.url);
    const { listPtyTerminals } = await import(moduleUrl);

    assert.deepEqual(listPtyTerminals(), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
    delete process.env.VIBYRA_TERMINAL_SESSION_ROOT;
  }
});

test("PTY terminal names can be changed without relaunching", async () => {
  const root = mkdtempSync(join(tmpdir(), "vibyra-pty-rename-"));
  process.env.VIBYRA_TERMINAL_SESSION_ROOT = root;
  try {
    const moduleUrl = new URL(`./ptyTerminals.mjs?rename=${Date.now()}`, import.meta.url);
    const { closeAllPtyTerminals, createPtyTerminal, listPtyTerminals, renamePtyTerminal } = await import(moduleUrl);
    await createPtyTerminal({ id: "rename-terminal", agent: "shell", title: "Original" });

    const renamed = renamePtyTerminal("rename-terminal", { title: "  Build checks  " });

    assert.equal(renamed.title, "Build checks");
    assert.equal(
      listPtyTerminals().find((terminal) => terminal.id === "rename-terminal")?.title,
      "Build checks"
    );
    closeAllPtyTerminals();
  } finally {
    rmSync(root, { recursive: true, force: true });
    delete process.env.VIBYRA_TERMINAL_SESSION_ROOT;
  }
});

test("running native terminals cannot switch providers or models in place", async () => {
  const root = mkdtempSync(join(tmpdir(), "vibyra-pty-model-switch-"));
  process.env.VIBYRA_TERMINAL_SESSION_ROOT = root;
  try {
    const moduleUrl = new URL(`./ptyTerminals.mjs?modelSwitch=${Date.now()}`, import.meta.url);
    const {
      closeAllPtyTerminals,
      createPtyTerminal,
      switchPtyTerminalModel
    } = await import(moduleUrl);
    await createPtyTerminal({
      id: "auto-model-switch",
      agent: "shell",
      title: "Shell 1"
    });

    assert.throws(
      () => switchPtyTerminalModel("auto-model-switch", { model: "openai/gpt-5.5" }),
      /requires a new terminal session/
    );
    closeAllPtyTerminals();
  } finally {
    rmSync(root, { recursive: true, force: true });
    delete process.env.VIBYRA_TERMINAL_SESSION_ROOT;
  }
});

test("reusing a running terminal ID cannot switch its project", async () => {
  const root = mkdtempSync(join(tmpdir(), "vibyra-pty-project-conflict-"));
  process.env.VIBYRA_TERMINAL_SESSION_ROOT = root;
  const { appState } = await import("./state.mjs");
  const previousProjects = appState.cachedProjects;
  const projectA = join(root, "project-a");
  const projectB = join(root, "project-b");
  mkdirSync(projectA, { recursive: true });
  mkdirSync(projectB, { recursive: true });
  appState.cachedProjects = [
    { id: "project-a", name: "A", path: projectA },
    { id: "project-b", name: "B", path: projectB }
  ];
  try {
    const moduleUrl = new URL(`./ptyTerminals.mjs?projectConflict=${Date.now()}`, import.meta.url);
    const { closeAllPtyTerminals, createPtyTerminal } = await import(moduleUrl);
    await createPtyTerminal({ id: "same-id", agent: "shell", projectId: "project-a" });

    await assert.rejects(
      () => createPtyTerminal({ id: "same-id", agent: "shell", projectId: "project-b" }),
      /already running in a different project/
    );
    closeAllPtyTerminals();
  } finally {
    appState.cachedProjects = previousProjects;
    await removeTreeEventually(root);
    delete process.env.VIBYRA_TERMINAL_SESSION_ROOT;
  }
});

test("reusing a running terminal ID cannot switch its model or launch settings", async () => {
  const root = mkdtempSync(join(tmpdir(), "vibyra-pty-settings-conflict-"));
  process.env.VIBYRA_TERMINAL_SESSION_ROOT = root;
  try {
    const moduleUrl = new URL(`./ptyTerminals.mjs?settingsConflict=${Date.now()}`, import.meta.url);
    const { closeAllPtyTerminals, createPtyTerminal } = await import(moduleUrl);
    await createPtyTerminal({
      id: "same-settings-id",
      agent: "shell",
      model: "first-model",
      reasoningEffort: "medium",
      permissionMode: "standard",
      tokenMode: "vibyra"
    });

    await assert.rejects(
      () => createPtyTerminal({
        id: "same-settings-id",
        agent: "shell",
        model: "second-model",
        reasoningEffort: "medium",
        permissionMode: "standard",
        tokenMode: "vibyra"
      }),
      /already running with different launch settings/
    );
    closeAllPtyTerminals();
  } finally {
    rmSync(root, { recursive: true, force: true });
    delete process.env.VIBYRA_TERMINAL_SESSION_ROOT;
  }
});

test("restored terminal cwd must match the server-resolved project", async () => {
  const root = mkdtempSync(join(tmpdir(), "vibyra-pty-restore-location-"));
  process.env.VIBYRA_TERMINAL_SESSION_ROOT = root;
  const { appState } = await import("./state.mjs");
  const previousProjects = appState.cachedProjects;
  const projectPath = join(root, "SaaS");
  const blockedPath = join(root, "blocked");
  mkdirSync(projectPath, { recursive: true });
  mkdirSync(blockedPath, { recursive: true });
  const projectId = Buffer.from(projectPath).toString("base64url");
  appState.cachedProjects = [{
    id: projectId,
    name: "SaaS",
    path: projectPath
  }];
  try {
    const moduleUrl = new URL(`./ptyTerminals.mjs?restoreLocation=${Date.now()}`, import.meta.url);
    const { restoredTerminalLocation } = await import(moduleUrl);
    const config = {
      projectId,
      cwd: projectPath
    };

    assert.deepEqual(await restoredTerminalLocation(config), {
      ...config,
      workspaceMode: "shared",
      branchName: "",
      workspacePath: "",
      repositoryRoot: "",
      workspaceNotice: ""
    });
    assert.equal(await restoredTerminalLocation({ ...config, cwd: blockedPath }), null);
    assert.equal(await restoredTerminalLocation({ projectId: "manufactured-id", cwd: blockedPath }), null);
  } finally {
    appState.cachedProjects = previousProjects;
    await removeTreeEventually(root);
    delete process.env.VIBYRA_TERMINAL_SESSION_ROOT;
  }
});

test("isolated PTY sessions use and preserve an authoritative Git worktree", async () => {
  const root = mkdtempSync(join(tmpdir(), "vibyra-pty-worktree-"));
  const repo = join(root, "repo");
  const sessions = join(root, "sessions");
  const worktrees = join(root, "worktrees");
  mkdirSync(repo, { recursive: true });
  git(repo, "init");
  git(repo, "config", "user.email", "tests@vibyra.local");
  git(repo, "config", "user.name", "Vibyra Tests");
  writeFileSync(join(repo, "README.md"), "clean\n");
  git(repo, "add", ".");
  git(repo, "commit", "-m", "initial");
  process.env.VIBYRA_TERMINAL_SESSION_ROOT = sessions;
  process.env.VIBYRA_TERMINAL_WORKTREE_ROOT = worktrees;
  const { appState } = await import("./state.mjs");
  const previousProjects = appState.cachedProjects;
  const project = { id: Buffer.from(repo).toString("base64url"), name: "Repo", path: repo };
  appState.cachedProjects = [project];
  let workspace = null;
  try {
    const moduleUrl = new URL(`./ptyTerminals.mjs?worktree=${Date.now()}`, import.meta.url);
    const { closePtyTerminal, createPtyTerminal } = await import(moduleUrl);
    workspace = await createPtyTerminal({
      id: "isolated-terminal",
      agent: "shell",
      projectId: project.id,
      workspaceMode: "worktree"
    });
    assert.equal(workspace.workspaceMode, "worktree");
    assert.match(workspace.branchName, /^vibyra\//);
    assert.equal(git(workspace.workspacePath, "branch", "--show-current"), workspace.branchName);
    closePtyTerminal(workspace.id);
    assert.equal(existsSync(workspace.workspacePath), true);
  } finally {
    if (workspace) {
      const { rollbackPreparedTerminalWorkspace } = await import("./terminalWorktrees.mjs");
      await rollbackPreparedTerminalWorkspace(workspace);
    }
    appState.cachedProjects = previousProjects;
    rmSync(root, { recursive: true, force: true });
    delete process.env.VIBYRA_TERMINAL_SESSION_ROOT;
    delete process.env.VIBYRA_TERMINAL_WORKTREE_ROOT;
  }
});

test("dirty isolated PTY requests can safely fall back to the shared project", async () => {
  const root = mkdtempSync(join(tmpdir(), "vibyra-pty-worktree-fallback-"));
  const sessions = join(root, "sessions");
  process.env.VIBYRA_TERMINAL_SESSION_ROOT = sessions;
  const { appState } = await import("./state.mjs");
  const previousProjects = appState.cachedProjects;
  const project = { id: Buffer.from(root).toString("base64url"), name: "Dirty", path: root };
  git(root, "init");
  git(root, "config", "user.email", "tests@vibyra.local");
  git(root, "config", "user.name", "Vibyra Tests");
  writeFileSync(join(root, "README.md"), "clean\n");
  git(root, "add", ".");
  git(root, "commit", "-m", "initial");
  writeFileSync(join(root, "README.md"), "dirty\n");
  appState.cachedProjects = [project];
  try {
    const moduleUrl = new URL(`./ptyTerminals.mjs?fallback=${Date.now()}`, import.meta.url);
    const { closePtyTerminal, createPtyTerminal } = await import(moduleUrl);
    const session = await createPtyTerminal({
      id: "fallback-terminal",
      agent: "shell",
      projectId: project.id,
      workspaceMode: "worktree",
      allowSharedFallback: true
    });
    assert.equal(session.workspaceMode, "shared");
    assert.equal(session.cwd, root);
    assert.match(session.workspaceNotice, /opened in the shared folder/);
    closePtyTerminal(session.id);
  } finally {
    appState.cachedProjects = previousProjects;
    await removeTreeEventually(root);
    delete process.env.VIBYRA_TERMINAL_SESSION_ROOT;
  }
});

function fakeProviderCli(root, name) {
  return fakeNodeCli(root, name, `
if (process.argv.includes("--version")) {
  process.stdout.write("codex-cli 0.138.0\\n");
  process.exit(0);
}
process.stdout.write("Write tests for @filename\\n");
process.stdin.resume();
setInterval(() => {}, 1000);
`);
}

function fakeAutoProviderCli(root, name, argsPath, promptPath) {
  return fakeNodeCli(root, name, `
import { appendFileSync, writeFileSync } from "node:fs";
appendFileSync(${JSON.stringify(argsPath)}, process.argv.slice(2).join(" ") + "\\n");
if (process.argv.includes("--version")) {
  process.stdout.write("codex-cli 0.138.0\\n");
  process.exit(0);
}
setTimeout(() => process.stdout.write("Write tests for @filename\\n"), 200);
let prompt = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  prompt += chunk;
  writeFileSync(${JSON.stringify(promptPath)}, prompt);
});
setInterval(() => {}, 1000);
`);
}

function fakeNodeCli(root, name, source) {
  const script = join(root, `${name}.mjs`);
  writeFileSync(script, `${source.trim()}\n`);
  if (process.platform === "win32") {
    const command = join(root, `${name}.cmd`);
    writeFileSync(command, `@echo off\r\nnode "%~dp0${name}.mjs" %*\r\n`);
    return command;
  }
  const command = join(root, name);
  writeFileSync(command, `#!/usr/bin/env bash\nexec "${process.execPath}" "${script}" "$@"\n`);
  chmodSync(command, 0o755);
  return command;
}

async function removeTreeEventually(path) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try { rmSync(path, { recursive: true, force: true }); } catch {}
    if (!existsSync(path)) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  rmSync(path, { recursive: true, force: true });
}
