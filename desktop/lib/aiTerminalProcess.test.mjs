import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readlinkSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { aiTerminalAgentArgs, aiTerminalAgentStatus, aiTerminalProviderVersion, codexModelMigration, listAiTerminalAgentStatuses, spawnAiTerminalProcess } from "./aiTerminalProcess.mjs";
import { VIBYRA_AGENT_ENTRY_PATH } from "./aiTerminalRuntimeCatalog.mjs";
import { AI_TERMINAL_LAUNCH_CONTRACT_VERSION } from "./aiTerminalProviderAdapters.mjs";
import { PORT } from "./state.mjs";
import { terminalEnv } from "./aiTerminalVibyraShell.mjs";

test("taskless Vibyra Auto has no launchable foreground process", () => {
  const status = aiTerminalAgentStatus();

  assert.equal(status.key, "vibyra");
  assert.equal(status.label, "Vibyra");
  assert.equal(status.available, false);
  assert.equal(status.launchMode, "native-provider");
  assert.equal(status.commandPath, "");
});

test("terminal agent statuses include Vibyra before optional local CLIs", () => {
  const statuses = listAiTerminalAgentStatuses();

  assert.equal(statuses[0].key, "vibyra");
  assert.notEqual(statuses[0].runtimeId, "vibyra,codex,claude,gemini,shell");
  assert.ok(statuses.some((status) => status.key === "codex"));
  assert.ok(statuses.some((status) => status.key === "shell"));
});

test("provider presentation versions come from installed CLIs when available", () => {
  const codex = aiTerminalProviderVersion("gpt-5.5");
  const claude = aiTerminalProviderVersion("claude-opus-4.8");
  if (codex) assert.match(codex, /^\d+\.\d+\.\d+$/);
  if (claude) assert.match(claude, /^\d+\.\d+\.\d+$/);
  assert.equal(aiTerminalProviderVersion("deepseek/deepseek-chat"), "");
});

test("Codex launch acknowledges the selected model's current migration notice", () => {
  const home = mkdtempSync(join(tmpdir(), "vibyra-codex-migration-"));
  writeFileSync(join(home, "models_cache.json"), JSON.stringify({
    models: [{
      slug: "gpt-5.4",
      upgrade: { model: "gpt-5.5", migration_markdown: "Introducing GPT-5.5" }
    }]
  }));

  try {
    const migration = codexModelMigration("openai/gpt-5.4", home);
    assert.deepEqual(migration, { from: "gpt-5.4", to: "gpt-5.5" });
    assert.deepEqual(
      aiTerminalAgentArgs("codex", {
        model: "gpt-5.4",
        modelMigration: migration,
        deferMcpTools: true,
        reasoningEffort: "default"
      }),
      [
        "--no-alt-screen",
        "--model",
        "gpt-5.4",
        "-c",
        'notice.model_migrations={"gpt-5.4"="gpt-5.5"}',
        "--enable",
        "tool_search_always_defer_mcp_tools"
      ]
    );
    assert.equal(codexModelMigration("gpt-5.5", home), null);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("concrete Vibyra OpenAI terminals launch managed Codex with the Vibyra Responses provider", () => {
  const status = aiTerminalAgentStatus("vibyra", "openai/gpt-5.5");
  const codexStatus = aiTerminalAgentStatus("codex");
  const args = aiTerminalAgentArgs("vibyra", {
    model: "openai/gpt-5.5",
    reasoningEffort: "high",
    permissionMode: "standard",
    cwd: "/tmp/Vibyra Project"
  });

  assert.equal(status.commandPath, codexStatus.commandPath);
  assert.equal(status.agentEnginePath, codexStatus.commandPath);
  assert.deepEqual(args, [
    "--no-alt-screen",
    "--model",
    "openai/gpt-5.5",
    "-c",
    'model_provider="vibyra"',
    "-c",
    'model_providers.vibyra.name="Vibyra tokens"',
    "-c",
    `model_providers.vibyra.base_url="http://127.0.0.1:${PORT}/desktop/v1"`,
    "-c",
    'model_providers.vibyra.wire_api="responses"',
    "-c",
    'model_providers.vibyra.env_key="VIBYRA_TERMINAL_GATEWAY_TOKEN"',
    "-c",
    'model_reasoning_effort="high"',
    "--sandbox",
    "workspace-write",
    "--ask-for-approval",
    "on-request"
  ]);
});

test("unknown qualified providers launch the bundled Vibyra Agent entry in Node", () => {
  const status = aiTerminalAgentStatus(
    "vibyra",
    "deepseek/deepseek-v3",
    "vibyra-agent"
  );
  const args = aiTerminalAgentArgs("vibyra-agent", {
    model: "deepseek/deepseek-v3"
  });

  assert.equal(status.commandPath, process.execPath);
  assert.equal(status.agentEnginePath, aiTerminalAgentStatus("codex").commandPath);
  assert.equal(status.agentEngineAvailable, true);
  assert.equal(status.available, true);
  assert.equal(status.runtimeId, "vibyra-agent");
  assert.equal(status.launchMode, "vibyra-agent");
  assert.deepEqual(args, [VIBYRA_AGENT_ENTRY_PATH]);
});

test("Vibyra Agent rejects forged provider ownership and stale launch contracts", () => {
  const launchPlan = {
    billingMode: "vibyra",
    providerId: "deepseek",
    runtimeId: "vibyra-agent",
    adapterId: "responses",
    protocol: "openai-responses",
    nativeModel: "deepseek/deepseek-v3",
    billingModel: "deepseek/deepseek-v3",
    allowedModels: ["deepseek/deepseek-v3"],
    permissionMode: "standard",
    sandboxMode: "workspace-write",
    launchContractVersion: AI_TERMINAL_LAUNCH_CONTRACT_VERSION
  };

  assert.throws(
    () => spawnAiTerminalProcess({
      agent: "vibyra",
      model: "deepseek/deepseek-v3",
      launchPlan: { ...launchPlan, providerId: "x-ai" }
    }),
    /mismatched billing or model metadata/
  );
  assert.throws(
    () => spawnAiTerminalProcess({
      agent: "vibyra",
      model: "deepseek/deepseek-v3",
      launchPlan: {
        ...launchPlan,
        launchContractVersion: AI_TERMINAL_LAUNCH_CONTRACT_VERSION - 1
      }
    }),
    /mismatched billing or model metadata/
  );
});

test("Auto must route before native process arguments are created", () => {
  const status = aiTerminalAgentStatus("vibyra", "auto");

  assert.equal(status.available, false);
  assert.equal(status.commandPath, "");
  assert.throws(
    () => aiTerminalAgentArgs("vibyra", { model: "auto" }),
    /route to a concrete native provider/
  );
});

test("concrete Vibyra full access uses native Codex bypass mode", () => {
  const args = aiTerminalAgentArgs("vibyra", {
    model: "openai/gpt-5.5",
    reasoningEffort: "default",
    permissionMode: "full"
  });

  assert.equal(args.includes("--dangerously-bypass-approvals-and-sandbox"), true);
  assert.equal(args.includes("--sandbox"), false);
  assert.equal(args.includes("--ask-for-approval"), false);
  assert.equal(args.includes("--model"), true);
  assert.equal(args.includes("openai/gpt-5.5"), true);
  assert.equal(args.includes('model_provider="vibyra"'), true);
});

test("Codex launch args carry model, fast effort, and explicit full access", () => {
  const args = aiTerminalAgentArgs("codex", {
    model: "openai/gpt-5.5",
    reasoningEffort: "low",
    permissionMode: "full"
  });

  assert.deepEqual(args, [
    "--no-alt-screen",
    "--model",
    "gpt-5.5",
    "-c",
    "model_reasoning_effort=\"low\"",
    "--dangerously-bypass-approvals-and-sandbox"
  ]);
});

test("Codex standard mode does not bypass approvals or sandboxing", () => {
  const args = aiTerminalAgentArgs("codex", {
    model: "gpt-5.5",
    reasoningEffort: "medium",
    permissionMode: "standard"
  });

  assert.equal(args.includes("--dangerously-bypass-approvals-and-sandbox"), false);
});

test("Codex Team roles use developer instructions and an enforced read-only sandbox", () => {
  const args = aiTerminalAgentArgs("codex", {
    model: "gpt-5.5",
    permissionMode: "standard",
    sandboxMode: "read-only",
    roleInstructions: "Role: Reviewer"
  });

  assert.ok(args.includes('developer_instructions="Role: Reviewer"'));
  assert.deepEqual(args.slice(-4), ["--sandbox", "read-only", "--ask-for-approval", "never"]);
  assert.equal(args.includes("--dangerously-bypass-approvals-and-sandbox"), false);
});

test("Claude launch appends Vibyra Memory as system context", () => {
  const args = aiTerminalAgentArgs("claude", {
    memoryInstructions: "Vibyra project memory snapshot"
  });

  assert.deepEqual(args, [
    "--append-system-prompt",
    "Vibyra project memory snapshot"
  ]);
});

test("Claude Team roles replace memory context and restrict tools in plan mode", () => {
  const args = aiTerminalAgentArgs("claude", {
    model: "anthropic/claude-sonnet-4",
    memoryInstructions: "Untrusted repository memory",
    roleInstructions: "Role: Reviewer",
    sandboxMode: "read-only"
  });

  assert.deepEqual(args, [
    "--append-system-prompt",
    "Role: Reviewer",
    "--model",
    "claude-sonnet-4",
    "--permission-mode",
    "plan",
    "--tools",
    "Read,Glob,Grep",
    "--disable-slash-commands",
    "--strict-mcp-config"
  ]);
  assert.equal(args.includes("Untrusted repository memory"), false);
});

test("personal Claude and Gemini launches pass the selected native model", () => {
  assert.deepEqual(aiTerminalAgentArgs("claude", {
    model: "anthropic/claude-sonnet-4"
  }), [
    "--model",
    "claude-sonnet-4"
  ]);
  assert.deepEqual(aiTerminalAgentArgs("gemini", {
    model: "google/gemini-2.5-pro"
  }), [
    "--model",
    "gemini-2.5-pro"
  ]);
});

test("Claude and Gemini full access use their native bypass launch modes", () => {
  assert.deepEqual(aiTerminalAgentArgs("claude", {
    model: "anthropic/claude-sonnet-4",
    permissionMode: "full"
  }), [
    "--model",
    "claude-sonnet-4",
    "--dangerously-skip-permissions"
  ]);
  assert.deepEqual(aiTerminalAgentArgs("gemini", {
    model: "google/gemini-2.5-pro",
    permissionMode: "full"
  }), [
    "--model",
    "gemini-2.5-pro",
    "--approval-mode",
    "yolo",
    "--no-sandbox"
  ]);
});

test("Grok Build uses its native model, permissions, and sandbox flags", () => {
  assert.deepEqual(aiTerminalAgentArgs("grok", {
    model: "x-ai/grok-build-0.1",
    permissionMode: "standard"
  }), [
    "--no-auto-update",
    "--no-alt-screen",
    "--model",
    "grok-build-0.1",
    "--permission-mode",
    "default",
    "--sandbox",
    "workspace"
  ]);
  assert.deepEqual(aiTerminalAgentArgs("grok", {
    model: "x-ai/grok-build-0.1",
    permissionMode: "full"
  }), [
    "--no-auto-update",
    "--no-alt-screen",
    "--model",
    "grok-build-0.1",
    "--permission-mode",
    "bypassPermissions",
    "--sandbox",
    "off"
  ]);
});

test("Qwen Code uses its official model, approval, and sandbox flags", () => {
  assert.deepEqual(aiTerminalAgentArgs("qwen", {
    model: "qwen/qwen3-coder",
    permissionMode: "standard"
  }), [
    "--model",
    "qwen3-coder",
    "--approval-mode",
    "default",
    "--sandbox"
  ]);
  assert.deepEqual(aiTerminalAgentArgs("qwen", {
    model: "qwen/qwen3-coder",
    permissionMode: "full"
  }), [
    "--model",
    "qwen3-coder",
    "--approval-mode",
    "yolo"
  ]);
  assert.deepEqual(aiTerminalAgentArgs("qwen", {
    model: "qwen/qwen3-coder",
    sandboxMode: "read-only"
  }), [
    "--model",
    "qwen3-coder",
    "--approval-mode",
    "plan",
    "--sandbox"
  ]);
});

test("Kimi Code and Mistral Vibe use their official permission modes", () => {
  assert.deepEqual(aiTerminalAgentArgs("kimi", {
    model: "moonshotai/kimi-k2",
    sandboxMode: "read-only"
  }), ["--plan"]);
  assert.deepEqual(aiTerminalAgentArgs("kimi", {
    model: "moonshotai/kimi-k2",
    permissionMode: "full"
  }), ["--yolo"]);
  assert.deepEqual(aiTerminalAgentArgs("mistral", {
    model: "mistralai/devstral-2",
    permissionMode: "standard"
  }), ["--agent", "default"]);
  assert.deepEqual(aiTerminalAgentArgs("mistral", {
    model: "mistralai/devstral-2",
    permissionMode: "full"
  }), ["--agent", "auto-approve"]);
  assert.deepEqual(aiTerminalAgentArgs("mistral", {
    model: "mistralai/devstral-2",
    sandboxMode: "read-only"
  }), ["--agent", "plan"]);
});

test("PTY terminal env carries selected OpenRouter model metadata", () => {
  const env = terminalEnv({
    agent: "vibyra",
    label: "Vibyra",
    model: "qwen/qwen3-coder",
    reasoningEffort: "high",
    permissionMode: "standard",
    projectId: "project-1",
    agentEnginePath: "/usr/local/bin/codex",
    providerUiVersion: "9.8.7",
    cols: 120,
    rows: 40
  });

  assert.equal(env.VIBYRA_TERMINAL_AGENT, "vibyra");
  assert.match(env.VIBYRA_DESKTOP_URL, /^http:\/\/127\.0\.0\.1:\d+$/);
  assert.equal(env.VIBYRA_OPENROUTER_MODEL, "qwen/qwen3-coder");
  assert.equal(env.VIBYRA_REASONING_EFFORT, "high");
  assert.equal(env.VIBYRA_PERMISSION_MODE, "standard");
  assert.equal(env.VIBYRA_TOKEN_MODE, "vibyra");
  assert.equal(env.VIBYRA_TERMINAL_COLOR, "1");
  assert.equal(env.NO_COLOR, undefined);
  assert.equal(env.TERM, "xterm-256color");
  assert.equal(env.COLORTERM, "truecolor");
  assert.equal(env.FORCE_COLOR, "3");
  assert.equal(env.VIBYRA_TERMINAL_PROJECT_ID, "project-1");
  assert.equal(env.VIBYRA_AGENT_ENGINE, "/usr/local/bin/codex");
  assert.equal(env.VIBYRA_PROVIDER_UI_VERSION, "9.8.7");
});

test("terminal env never injects an OpenAI API key into official CLI sessions", () => {
  const previousKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "sk-test-openai-key-1234567890";
  try {
    const env = terminalEnv({
      agent: "codex",
      label: "Codex",
      model: "gpt-5.5",
      reasoningEffort: "medium",
      tokenMode: "provider",
      projectId: "",
      cols: 120,
      rows: 40
    });

    assert.equal(env.VIBYRA_TOKEN_MODE, "provider");
    assert.equal(env.OPENAI_API_KEY, undefined);
  } finally {
    if (previousKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previousKey;
  }
});

test("Vibyra token Codex homes contain only Vibyra-owned workspace trust", () => {
  const previousCodexHome = process.env.CODEX_HOME;
  const previousRoot = process.env.VIBYRA_CODEX_HOME_ROOT;
  const sourceHome = mkdtempSync(join(tmpdir(), "vibyra-source-auth-"));
  const isolatedRoot = mkdtempSync(join(tmpdir(), "vibyra-token-codex-"));
  process.env.CODEX_HOME = sourceHome;
  process.env.VIBYRA_CODEX_HOME_ROOT = isolatedRoot;
  writeFileSync(join(sourceHome, "auth.json"), "{\"auth_mode\":\"chatgpt\"}\n");
  writeFileSync(join(sourceHome, "config.toml"), "model = \"gpt-5.5\"\n");

  try {
    const env = terminalEnv({
      agent: "vibyra",
      label: "Vibyra",
      terminalId: "token-terminal",
      tokenMode: "vibyra",
      cwd: "/tmp/Vibyra Project",
      cols: 100,
      rows: 30
    });

    assert.equal(existsSync(join(env.CODEX_HOME, "auth.json")), false);
    assert.equal(
      readFileSync(join(env.CODEX_HOME, "config.toml"), "utf8"),
      '[projects."/tmp/Vibyra Project"]\ntrust_level = "trusted"\n'
    );
  } finally {
    if (previousCodexHome === undefined) delete process.env.CODEX_HOME;
    else process.env.CODEX_HOME = previousCodexHome;
    if (previousRoot === undefined) delete process.env.VIBYRA_CODEX_HOME_ROOT;
    else process.env.VIBYRA_CODEX_HOME_ROOT = previousRoot;
    rmSync(sourceHome, { recursive: true, force: true });
    rmSync(isolatedRoot, { recursive: true, force: true });
  }
});

test("Codex terminal env uses an isolated CODEX_HOME per terminal", () => {
  const previousCodexHome = process.env.CODEX_HOME;
  const previousRoot = process.env.VIBYRA_CODEX_HOME_ROOT;
  const sourceHome = mkdtempSync(join(tmpdir(), "vibyra-codex-source-"));
  const isolatedRoot = mkdtempSync(join(tmpdir(), "vibyra-codex-terminals-"));
  process.env.CODEX_HOME = sourceHome;
  process.env.VIBYRA_CODEX_HOME_ROOT = isolatedRoot;
  writeFileSync(join(sourceHome, "auth.json"), "{\"auth_mode\":\"chatgpt\"}\n");
  writeFileSync(join(sourceHome, "config.toml"), "model = \"gpt-5.5\"\n");
  writeFileSync(join(sourceHome, "models_cache.json"), "{\"models\":[]}\n");
  writeFileSync(join(sourceHome, "version.json"), "{\"latest_version\":\"0.138.0\"}\n");
  writeFileSync(join(sourceHome, "installation_id"), "installation-id\n");
  writeFileSync(join(sourceHome, ".personality_migration"), "v1\n");
  mkdirSync(join(sourceHome, ".tmp", "plugins"), { recursive: true });
  writeFileSync(join(sourceHome, ".tmp", "plugins", "README.md"), "cached marketplace\n");

  try {
    const first = terminalEnv({
      agent: "codex",
      label: "Codex",
      terminalId: "terminal/a",
      memoryInstructions: "Project memory",
      cols: 100,
      rows: 30
    });
    const second = terminalEnv({ agent: "codex", label: "Codex", terminalId: "terminal/b", cols: 100, rows: 30 });

    assert.notEqual(first.CODEX_HOME, sourceHome);
    assert.notEqual(first.CODEX_HOME, second.CODEX_HOME);
    assert.equal(first.CODEX_HOME, join(isolatedRoot, "terminal-a"));
    assert.equal(second.CODEX_HOME, join(isolatedRoot, "terminal-b"));
    assert.equal(existsSync(join(first.CODEX_HOME, "auth.json")), true);
    assert.equal(existsSync(join(first.CODEX_HOME, "config.toml")), true);
    assert.equal(readFileSync(join(first.CODEX_HOME, "models_cache.json"), "utf8"), "{\"models\":[]}\n");
    assert.equal(readFileSync(join(first.CODEX_HOME, "version.json"), "utf8"), "{\"latest_version\":\"0.138.0\"}\n");
    assert.equal(readFileSync(join(first.CODEX_HOME, "installation_id"), "utf8"), "installation-id\n");
    assert.equal(readFileSync(join(first.CODEX_HOME, ".personality_migration"), "utf8"), "v1\n");
    assert.match(readFileSync(join(first.CODEX_HOME, "AGENTS.md"), "utf8"), /Project memory/);
    assert.equal(lstatSync(join(first.CODEX_HOME, ".tmp", "plugins")).isSymbolicLink(), true);
    assert.equal(
      readlinkSync(join(first.CODEX_HOME, ".tmp", "plugins")),
      join(sourceHome, ".tmp", "plugins")
    );
  } finally {
    if (previousCodexHome === undefined) delete process.env.CODEX_HOME;
    else process.env.CODEX_HOME = previousCodexHome;
    if (previousRoot === undefined) delete process.env.VIBYRA_CODEX_HOME_ROOT;
    else process.env.VIBYRA_CODEX_HOME_ROOT = previousRoot;
    rmSync(sourceHome, { recursive: true, force: true });
    rmSync(isolatedRoot, { recursive: true, force: true });
  }
});

test("Gemini terminal env loads its private Memory settings", () => {
  const env = terminalEnv({
    agent: "gemini",
    label: "Gemini",
    geminiSettingsPath: "/tmp/vibyra-gemini-settings.json",
    cols: 100,
    rows: 30
  });

  assert.equal(env.GEMINI_CLI_SYSTEM_SETTINGS_PATH, "/tmp/vibyra-gemini-settings.json");
});

test("script-backed terminal resize updates the real PTY dimensions", async (t) => {
  if (process.platform !== "linux" || !existsSync("/usr/bin/script")) {
    t.skip("Linux script PTY is required");
    return;
  }
  let output = "";
  let child;
  const exited = new Promise((resolve) => {
    child = spawnAiTerminalProcess({
      agent: "shell",
      cwd: process.cwd(),
      cols: 90,
      rows: 24,
      onData: (data) => { output += data; },
      onExit: resolve
    });
  });

  try {
    await delay(100);
    child.resize(60, 15);
    child.resize(47, 13);
    await delay(100);
    child.stdin.write("stty size; exit\r");
    await Promise.race([
      exited,
      delay(3_000).then(() => { throw new Error("resized PTY did not exit"); })
    ]);
    assert.match(output, /13 47/);
  } finally {
    if (child?.exitCode === null) child.kill("SIGTERM");
  }
});

test("closing a script-backed terminal stops nested provider processes", async (t) => {
  if (process.platform !== "linux" || !existsSync("/usr/bin/script")) {
    t.skip("Linux script PTY is required");
    return;
  }
  let output = "";
  let child;
  let nestedPid = 0;
  const unrelated = spawn("sleep", ["30"], { stdio: "ignore" });
  const exited = new Promise((resolve) => {
    child = spawnAiTerminalProcess({
      agent: "shell",
      cwd: process.cwd(),
      cols: 90,
      rows: 24,
      onData: (data) => { output += data; },
      onExit: resolve
    });
  });

  try {
    child.stdin.write("sleep 30 & printf 'NESTED_PID:%s\\n' $!\r");
    nestedPid = await waitForNestedPid(() => output);
    assert.equal(processIsAlive(nestedPid), true);
    child.kill("SIGTERM");
    await Promise.race([
      exited,
      delay(3_000).then(() => { throw new Error("script PTY did not exit"); })
    ]);
    await waitForProcessExit(nestedPid);
    assert.equal(processIsAlive(unrelated.pid), true);
  } finally {
    if (child?.exitCode === null) child.kill("SIGKILL");
    if (unrelated.exitCode === null) unrelated.kill("SIGKILL");
    if (nestedPid && processIsAlive(nestedPid)) {
      try { process.kill(nestedPid, "SIGKILL"); } catch {}
    }
  }
});

async function waitForNestedPid(readOutput) {
  const deadline = Date.now() + 3_000;
  while (Date.now() < deadline) {
    const match = String(readOutput()).match(/NESTED_PID:(\d+)/);
    if (match) return Number(match[1]);
    await delay(25);
  }
  throw new Error("nested provider process did not start");
}

async function waitForProcessExit(pid) {
  const deadline = Date.now() + 3_000;
  while (Date.now() < deadline) {
    if (!processIsAlive(pid)) return;
    await delay(25);
  }
  throw new Error("nested provider process survived terminal close");
}

function processIsAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
