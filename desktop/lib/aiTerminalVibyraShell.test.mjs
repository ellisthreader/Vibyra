import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { terminalEnv, terminalSessionCommand } from "./aiTerminalVibyraShell.mjs";

test("Vibyra terminal env exposes only the supplied gateway token", () => {
  const previousToken = process.env.VIBYRA_TERMINAL_GATEWAY_TOKEN;
  const previousRoot = process.env.VIBYRA_CODEX_HOME_ROOT;
  const isolatedRoot = mkdtempSync(join(tmpdir(), "vibyra-gateway-token-"));
  process.env.VIBYRA_TERMINAL_GATEWAY_TOKEN = "inherited-token";
  process.env.VIBYRA_CODEX_HOME_ROOT = isolatedRoot;

  try {
    const vibyraEnv = terminalEnv({
      agent: "vibyra",
      label: "Vibyra",
      terminalId: "vibyra-session",
      terminalGatewayToken: "session-token",
      cols: 100,
      rows: 30
    });
    const shellEnv = terminalEnv({
      agent: "shell",
      label: "Shell",
      terminalGatewayToken: "session-token",
      cols: 100,
      rows: 30
    });

    assert.equal(vibyraEnv.VIBYRA_TERMINAL_GATEWAY_TOKEN, "session-token");
    assert.equal(shellEnv.VIBYRA_TERMINAL_GATEWAY_TOKEN, undefined);
    assert.equal(
      readFileSync(join(vibyraEnv.CODEX_HOME, "config.toml"), "utf8"),
      `[projects.${JSON.stringify(process.cwd())}]\ntrust_level = "trusted"\n`
    );
    assert.equal(statSync(join(vibyraEnv.CODEX_HOME, "config.toml")).mode & 0o777, 0o600);
  } finally {
    if (previousToken === undefined) delete process.env.VIBYRA_TERMINAL_GATEWAY_TOKEN;
    else process.env.VIBYRA_TERMINAL_GATEWAY_TOKEN = previousToken;
    if (previousRoot === undefined) delete process.env.VIBYRA_CODEX_HOME_ROOT;
    else process.env.VIBYRA_CODEX_HOME_ROOT = previousRoot;
    rmSync(isolatedRoot, { recursive: true, force: true });
  }
});

test("every PTY runtime receives a truecolor environment even when desktop disables color", () => {
  const previousNoColor = process.env.NO_COLOR;
  const previousTerm = process.env.TERM;
  process.env.NO_COLOR = "1";
  process.env.TERM = "dumb";

  try {
    for (const agent of ["shell", "codex", "claude", "gemini", "vibyra"]) {
      const env = terminalEnv({
        agent,
        runtimeId: agent === "vibyra" ? "claude" : agent,
        label: agent,
        terminalId: `color-${agent}`,
        cols: 100,
        rows: 30
      });

      assert.equal(env.NO_COLOR, undefined);
      assert.equal(env.TERM, "xterm-256color");
      assert.equal(env.COLORTERM, "truecolor");
      assert.equal(env.CLICOLOR, "1");
      assert.equal(env.CLICOLOR_FORCE, "1");
      assert.equal(env.FORCE_COLOR, "3");
    }
  } finally {
    if (previousNoColor === undefined) delete process.env.NO_COLOR;
    else process.env.NO_COLOR = previousNoColor;
    if (previousTerm === undefined) delete process.env.TERM;
    else process.env.TERM = previousTerm;
  }
});

test("AI terminal sessions exit with the AI process instead of opening a shell", () => {
  const command = terminalSessionCommand({
    status: { key: "vibyra", label: "Vibyra", commandPath: "/usr/bin/vibyra-ai" },
    launch: "'/usr/bin/vibyra-ai' '--interactive'",
    shell: "/bin/bash",
    cols: 120,
    rows: 40
  });

  assert.match(command, /exec .*\/usr\/bin\/vibyra-ai.*--interactive/);
  assert.doesNotMatch(command, /Project shell ready/);
  assert.doesNotMatch(command, /code=\$\?/);
});

test("managed Claude and Gemini receive only terminal-scoped gateway credentials", () => {
  const claude = terminalEnv({
    agent: "vibyra",
    runtimeId: "claude",
    model: "claude-haiku-4-5",
    terminalId: "managed-claude",
    terminalGatewayToken: "claude-token",
    cols: 100,
    rows: 30
  });
  const gemini = terminalEnv({
    agent: "vibyra",
    runtimeId: "gemini",
    terminalId: "managed-gemini",
    terminalGatewayToken: "gemini-token",
    cols: 100,
    rows: 30
  });

  assert.equal(claude.ANTHROPIC_AUTH_TOKEN, "claude-token");
  assert.equal(claude.ANTHROPIC_DEFAULT_HAIKU_MODEL, "claude-haiku-4-5");
  assert.match(claude.ANTHROPIC_BASE_URL, /\/desktop\/anthropic$/);
  assert.equal(claude.ANTHROPIC_API_KEY, undefined);
  assert.deepEqual(
    JSON.parse(readFileSync(join(claude.CLAUDE_CONFIG_DIR, "settings.json"), "utf8")).availableModels,
    ["claude-haiku-4-5"]
  );
  assert.equal(gemini.GEMINI_API_KEY, "gemini-token");
  assert.match(gemini.GOOGLE_GEMINI_BASE_URL, /\/desktop\/gemini$/);
  assert.equal(gemini.GOOGLE_GENAI_USE_VERTEXAI, "false");
  assert.equal(gemini.GEMINI_CLI_TRUST_WORKSPACE, "true");
  assert.match(gemini.GEMINI_CLI_SYSTEM_SETTINGS_PATH, /vibyra-system-settings\.json$/);
  const geminiSettings = JSON.parse(
    readFileSync(gemini.GEMINI_CLI_SYSTEM_SETTINGS_PATH, "utf8")
  );
  assert.equal(geminiSettings.security.auth.selectedType, "gemini-api-key");
  assert.equal(geminiSettings.security.auth.enforcedType, "gemini-api-key");
});

test("Vibyra Agent receives the exact model and only its terminal-scoped gateway", () => {
  const previousOpenRouterKey = process.env.OPENROUTER_API_KEY;
  const previousCodexHome = process.env.CODEX_HOME;
  process.env.OPENROUTER_API_KEY = "inherited-openrouter-key";
  process.env.CODEX_HOME = "/tmp/inherited-codex-home";
  try {
    const env = terminalEnv({
      agent: "vibyra",
      runtimeId: "vibyra-agent",
      label: "Vibyra Agent",
      model: "deepseek/deepseek-v3",
      terminalId: "managed-deepseek",
      terminalGatewayToken: "scoped-gateway-token",
      agentEnginePath: "/usr/local/bin/codex",
      cols: 100,
      rows: 30
    });

    assert.equal(env.VIBYRA_OPENROUTER_MODEL, "deepseek/deepseek-v3");
    assert.equal(env.VIBYRA_TERMINAL_GATEWAY_TOKEN, "scoped-gateway-token");
    assert.equal(env.OPENROUTER_API_KEY, undefined);
    assert.match(env.CODEX_HOME, /managed-deepseek$/);
    assert.equal(env.VIBYRA_AGENT_ENGINE, "/usr/local/bin/codex");
    assert.equal(
      readFileSync(join(env.CODEX_HOME, "config.toml"), "utf8"),
      `[projects.${JSON.stringify(process.cwd())}]\ntrust_level = "trusted"\n`
    );
  } finally {
    if (previousOpenRouterKey === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = previousOpenRouterKey;
    if (previousCodexHome === undefined) delete process.env.CODEX_HOME;
    else process.env.CODEX_HOME = previousCodexHome;
  }
});

test("shell terminal sessions remain interactive shells", () => {
  const command = terminalSessionCommand({
    status: { key: "shell", label: "Shell", commandPath: "" },
    launch: "",
    shell: "/bin/bash",
    cols: 100,
    rows: 30
  });

  assert.match(command, /exec '\\''\/bin\/bash'\\'' -i/);
  assert.match(command, /stty sane echo icanon isig opost onlcr/);
});
