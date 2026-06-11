import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
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

test("managed Grok receives an isolated exact-model Chat Completions profile", () => {
  const previousHome = process.env.HOME;
  const home = mkdtempSync(join(tmpdir(), "vibyra-grok-home-"));
  process.env.HOME = home;
  try {
    const grok = terminalEnv({
      agent: "vibyra",
      runtimeId: "grok",
      model: "grok-build-0.1",
      terminalId: "managed-grok",
      terminalGatewayToken: "grok-token",
      cols: 100,
      rows: 30
    });
    const config = readFileSync(join(grok.GROK_HOME, "config.toml"), "utf8");

    assert.equal(grok.VIBYRA_TERMINAL_GATEWAY_TOKEN, "grok-token");
    assert.equal(grok.XAI_API_KEY, undefined);
    assert.match(grok.GROK_HOME, /grok-terminals\/managed-grok$/);
    assert.match(config, /\[model\."grok-build-0\.1"\]/);
    assert.match(config, /base_url = "http:\/\/127\.0\.0\.1:\d+\/desktop\/grok\/v1"/);
    assert.match(config, /env_key = "VIBYRA_TERMINAL_GATEWAY_TOKEN"/);
    assert.match(config, /api_backend = "chat_completions"/);
    assert.equal(statSync(join(grok.GROK_HOME, "config.toml")).mode & 0o777, 0o600);
  } finally {
    if (previousHome === undefined) delete process.env.HOME;
    else process.env.HOME = previousHome;
    rmSync(home, { recursive: true, force: true });
  }
});

test("Qwen, Kimi, and Mistral receive isolated exact-model native profiles", () => {
  const previousHome = process.env.HOME;
  const home = mkdtempSync(join(tmpdir(), "vibyra-native-homes-"));
  process.env.HOME = home;
  try {
    const qwen = terminalEnv({
      agent: "vibyra",
      runtimeId: "qwen",
      model: "qwen3-coder",
      terminalId: "managed-qwen",
      terminalGatewayToken: "qwen-token",
      cols: 100,
      rows: 30
    });
    const qwenSettings = JSON.parse(readFileSync(qwen.QWEN_CODE_SYSTEM_SETTINGS_PATH, "utf8"));
    assert.match(qwen.QWEN_HOME, /qwen-terminals\/managed-qwen$/);
    assert.equal(qwen.VIBYRA_TERMINAL_GATEWAY_TOKEN, "qwen-token");
    assert.equal(qwen.OPENAI_API_KEY, "qwen-token");
    assert.equal(qwenSettings.model.name, "qwen3-coder");
    assert.equal(qwenSettings.modelProviders.openai[0].id, "qwen3-coder");
    assert.match(qwenSettings.modelProviders.openai[0].baseUrl, /^http:\/\/host\.docker\.internal:\d+\/desktop\/qwen\/v1$/);
    assert.equal(qwenSettings.modelProviders.openai[0].envKey, "OPENAI_API_KEY");

    const fullAccessQwen = terminalEnv({
      agent: "vibyra",
      runtimeId: "qwen",
      model: "qwen3-coder",
      permissionMode: "full",
      terminalId: "managed-qwen-full",
      terminalGatewayToken: "qwen-full-token",
      cols: 100,
      rows: 30
    });
    const fullAccessSettings = JSON.parse(
      readFileSync(fullAccessQwen.QWEN_CODE_SYSTEM_SETTINGS_PATH, "utf8")
    );
    assert.equal(fullAccessQwen.QWEN_SANDBOX, "false");
    assert.match(fullAccessSettings.modelProviders.openai[0].baseUrl, /^http:\/\/127\.0\.0\.1:\d+\/desktop\/qwen\/v1$/);

    const kimi = terminalEnv({
      agent: "vibyra",
      runtimeId: "kimi",
      model: "kimi-k2",
      terminalId: "managed-kimi",
      terminalGatewayToken: "kimi-token",
      cols: 100,
      rows: 30
    });
    const kimiConfig = readFileSync(join(kimi.KIMI_CODE_HOME, "config.toml"), "utf8");
    assert.match(kimi.KIMI_CODE_HOME, /kimi-terminals\/managed-kimi$/);
    assert.match(kimiConfig, /type = "openai_responses"/);
    assert.match(kimiConfig, /base_url = "http:\/\/127\.0\.0\.1:\d+\/desktop\/kimi\/v1"/);
    assert.match(kimiConfig, /api_key = "kimi-token"/);
    assert.match(kimiConfig, /model = "kimi-k2"/);

    const mistral = terminalEnv({
      agent: "vibyra",
      runtimeId: "mistral",
      model: "devstral-2",
      terminalId: "managed-mistral",
      terminalGatewayToken: "mistral-token",
      cwd: "/tmp/Vibyra Project",
      cols: 100,
      rows: 30
    });
    const mistralConfig = readFileSync(join(mistral.VIBE_HOME, "config.toml"), "utf8");
    assert.match(mistral.VIBE_HOME, /mistral-terminals\/managed-mistral$/);
    assert.match(mistralConfig, /api_style = "openai-responses"/);
    assert.match(mistralConfig, /api_key_env_var = "VIBYRA_TERMINAL_GATEWAY_TOKEN"/);
    assert.match(mistralConfig, /name = "devstral-2"/);
    assert.match(mistralConfig, /active_model = "devstral-2-vibyra"/);
    assert.match(mistralConfig, /enabled_skills = \["vibe"\]/);
    assert.equal(mistral.VIBYRA_TERMINAL_GATEWAY_TOKEN, "mistral-token");
    assert.match(
      readFileSync(join(mistral.VIBE_HOME, "trusted_folders.toml"), "utf8"),
      /untrusted = \["\/tmp\/Vibyra Project"\]/
    );
  } finally {
    if (previousHome === undefined) delete process.env.HOME;
    else process.env.HOME = previousHome;
    rmSync(home, { recursive: true, force: true });
  }
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
    assert.ok(env.VIBYRA_AGENT_INSTRUCTIONS_FILE);
    assert.equal(existsSync(env.VIBYRA_AGENT_INSTRUCTIONS_FILE), true);
    const instructions = readFileSync(env.VIBYRA_AGENT_INSTRUCTIONS_FILE, "utf8");
    assert.match(instructions, /You are Vibyra Agent/);
    assert.match(instructions, /exact model selected in the Vibyra terminal through OpenRouter/);
    assert.match(instructions, /Never identify yourself as Codex, Codex CLI, OpenAI/);
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
