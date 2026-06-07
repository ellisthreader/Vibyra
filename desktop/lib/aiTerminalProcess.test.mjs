import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { aiTerminalAgentArgs, aiTerminalAgentStatus, listAiTerminalAgentStatuses } from "./aiTerminalProcess.mjs";
import { terminalEnv } from "./aiTerminalVibyraShell.mjs";

test("Vibyra PTY agent is the default available terminal agent", () => {
  const status = aiTerminalAgentStatus();

  assert.equal(status.key, "vibyra");
  assert.equal(status.label, "Vibyra");
  assert.equal(status.available, true);
});

test("terminal agent statuses include Vibyra before optional local CLIs", () => {
  const statuses = listAiTerminalAgentStatuses();

  assert.equal(statuses[0].key, "vibyra");
  assert.ok(statuses.some((status) => status.key === "codex"));
  assert.ok(statuses.some((status) => status.key === "shell"));
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

test("PTY terminal env carries selected OpenRouter model metadata", () => {
  const env = terminalEnv({
    agent: "vibyra",
    label: "Vibyra",
    model: "qwen/qwen3-coder",
    reasoningEffort: "high",
    permissionMode: "standard",
    projectId: "project-1",
    cols: 120,
    rows: 40
  });

  assert.equal(env.VIBYRA_TERMINAL_AGENT, "vibyra");
  assert.equal(env.VIBYRA_OPENROUTER_MODEL, "qwen/qwen3-coder");
  assert.equal(env.VIBYRA_REASONING_EFFORT, "high");
  assert.equal(env.VIBYRA_PERMISSION_MODE, "standard");
  assert.equal(env.VIBYRA_TOKEN_MODE, "vibyra");
  assert.equal(env.VIBYRA_TERMINAL_PROJECT_ID, "project-1");
});

test("terminal env injects OpenAI credentials only for provider token mode", () => {
  const previousKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "sk-test-openai-key-1234567890";
  try {
    const env = terminalEnv({
      agent: "vibyra",
      label: "Vibyra",
      model: "openai/gpt-4o-mini",
      reasoningEffort: "medium",
      tokenMode: "provider",
      projectId: "",
      cols: 120,
      rows: 40
    });

    assert.equal(env.VIBYRA_TOKEN_MODE, "provider");
    assert.equal(env.OPENAI_API_KEY, "sk-test-openai-key-1234567890");
  } finally {
    if (previousKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previousKey;
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

  try {
    const first = terminalEnv({ agent: "codex", label: "Codex", terminalId: "terminal/a", cols: 100, rows: 30 });
    const second = terminalEnv({ agent: "codex", label: "Codex", terminalId: "terminal/b", cols: 100, rows: 30 });

    assert.notEqual(first.CODEX_HOME, sourceHome);
    assert.notEqual(first.CODEX_HOME, second.CODEX_HOME);
    assert.equal(first.CODEX_HOME, join(isolatedRoot, "terminal-a"));
    assert.equal(second.CODEX_HOME, join(isolatedRoot, "terminal-b"));
    assert.equal(existsSync(join(first.CODEX_HOME, "auth.json")), true);
    assert.equal(existsSync(join(first.CODEX_HOME, "config.toml")), true);
  } finally {
    if (previousCodexHome === undefined) delete process.env.CODEX_HOME;
    else process.env.CODEX_HOME = previousCodexHome;
    if (previousRoot === undefined) delete process.env.VIBYRA_CODEX_HOME_ROOT;
    else process.env.VIBYRA_CODEX_HOME_ROOT = previousRoot;
    rmSync(sourceHome, { recursive: true, force: true });
    rmSync(isolatedRoot, { recursive: true, force: true });
  }
});
