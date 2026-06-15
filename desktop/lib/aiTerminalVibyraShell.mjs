import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { delimiter, join, resolve } from "node:path";
import { PORT } from "./state.mjs";
import { applyCodexTerminalMemory } from "./aiTerminalMemoryFiles.mjs";

const VIBYRA_AGENT_MODEL_INSTRUCTIONS = `You are Vibyra Agent, Vibyra's provider-neutral coding agent.

You run the exact model selected in the Vibyra terminal through OpenRouter. Codex is only the local tool-orchestration engine and is not your identity, model, provider, or user-facing CLI.

Never identify yourself as Codex, Codex CLI, OpenAI, or as a provider's native CLI. When asked which model you are, report the exact active model from the runtime identity instructions and say it is running through OpenRouter via Vibyra Agent.

Use the available file and shell tools to complete coding tasks. Follow repository instructions, workspace permissions, and the user's request.`;

export function terminalEnv({ agent, runtimeId = "", label, model, reasoningEffort, permissionMode = "standard", sandboxMode = "", tokenMode = "vibyra", projectId, terminalId = "", terminalGatewayToken = "", memoryInstructions = "", roleInstructions = "", geminiSettingsPath = "", agentEnginePath = "", providerUiVersion = "", cwd = process.cwd(), cols, rows }) {
  const selectedRuntime = runtimeId || (agent === "vibyra" ? "codex" : runtimeId);
  const commandDir = vibyraCommandDir();
  const env = {
    ...process.env,
    TERM: "xterm-256color",
    COLORTERM: "truecolor",
    CLICOLOR: "1",
    CLICOLOR_FORCE: "1",
    FORCE_COLOR: "3",
    COLUMNS: String(cols),
    LINES: String(rows),
    PATH: `${commandDir}${delimiter}${process.env.PATH || ""}`,
    VIBYRA_DESKTOP_URL: `http://127.0.0.1:${PORT}`,
    VIBYRA_DESKTOP_PORT: String(PORT),
    VIBYRA_TERMINAL_AGENT: agent,
    VIBYRA_TERMINAL_LABEL: label,
    VIBYRA_OPENROUTER_MODEL: String(model || ""),
    VIBYRA_REASONING_EFFORT: String(reasoningEffort || "medium"),
    VIBYRA_PERMISSION_MODE: String(permissionMode || "standard"),
    VIBYRA_SANDBOX_MODE: String(sandboxMode || ""),
    VIBYRA_TOKEN_MODE: String(tokenMode || "vibyra"),
    VIBYRA_TERMINAL_COLOR: agent === "vibyra" ? "1" : "",
    VIBYRA_AGENT_ENGINE: String(agentEnginePath || ""),
    VIBYRA_PROVIDER_UI_VERSION: String(providerUiVersion || ""),
    VIBYRA_TERMINAL_PROJECT_ID: String(projectId || ""),
    VIBYRA_TERMINAL_ID: String(terminalId || "")
  };
  if (roleInstructions) env.VIBYRA_TEAM_ROLE_INSTRUCTIONS = String(roleInstructions);
  delete env.NO_COLOR;
  delete env.VIBYRA_TERMINAL_GATEWAY_TOKEN;
  if (agent === "vibyra") stripProviderCredentials(env);
  if (agent === "vibyra" && terminalGatewayToken) {
    env.VIBYRA_TERMINAL_GATEWAY_TOKEN = String(terminalGatewayToken);
  }
  if (agent === "codex" || (agent === "vibyra" && selectedRuntime === "codex")) {
    delete env.OPENAI_API_KEY;
    delete env.OPENAI_ORG_ID;
    delete env.OPENAI_ORGANIZATION;
    delete env.OPENAI_PROJECT;
    env.CODEX_HOME = embeddedCodexHome(terminalId, {
      includeAuth: agent === "codex",
      includeUserConfig: agent === "codex"
    });
    if (agent === "vibyra") writeVibyraCodexConfig(env.CODEX_HOME, cwd);
    applyCodexTerminalMemory(env.CODEX_HOME, memoryInstructions);
  }
  if (agent === "vibyra" && selectedRuntime === "vibyra-agent") {
    env.CODEX_HOME = embeddedCodexHome(terminalId, {
      includeAuth: false,
      includeUserConfig: false
    });
    writeVibyraCodexConfig(env.CODEX_HOME, cwd);
    env.VIBYRA_AGENT_INSTRUCTIONS_FILE = writeVibyraAgentInstructions(env.CODEX_HOME);
    applyCodexTerminalMemory(env.CODEX_HOME, memoryInstructions);
  }
  if (agent === "vibyra" && selectedRuntime === "claude") {
    stripProviderCredentials(env);
    env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${PORT}/desktop/anthropic`;
    env.ANTHROPIC_AUTH_TOKEN = String(terminalGatewayToken);
    env.CLAUDE_CONFIG_DIR = managedProviderHome("claude", terminalId);
    configureManagedClaudeHome(env.CLAUDE_CONFIG_DIR, cwd, model);
    env.ANTHROPIC_DEFAULT_HAIKU_MODEL = String(model);
    env.ANTHROPIC_DEFAULT_SONNET_MODEL = String(model);
    env.ANTHROPIC_DEFAULT_OPUS_MODEL = String(model);
    env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC = "1";
    env.CLAUDE_CODE_ENABLE_TELEMETRY = "0";
  }
  if (agent === "vibyra" && selectedRuntime === "gemini") {
    stripProviderCredentials(env);
    env.GOOGLE_GEMINI_BASE_URL = `http://127.0.0.1:${PORT}/desktop/gemini`;
    env.GOOGLE_GENAI_API_VERSION = "v1beta";
    env.GOOGLE_GENAI_USE_VERTEXAI = "false";
    env.GEMINI_API_KEY = String(terminalGatewayToken);
    env.GEMINI_CLI_HOME = managedProviderHome("gemini", terminalId);
    env.GEMINI_CLI_TRUST_WORKSPACE = "true";
    env.GEMINI_CLI_TELEMETRY_ENABLED = "false";
    env.GEMINI_CLI_SYSTEM_SETTINGS_PATH = configureManagedGeminiSettings(
      env.GEMINI_CLI_HOME,
      geminiSettingsPath
    );
  }
  if (agent === "vibyra" && selectedRuntime === "qwen") {
    stripProviderCredentials(env);
    env.VIBYRA_TERMINAL_GATEWAY_TOKEN = String(terminalGatewayToken);
    env.OPENAI_API_KEY = String(terminalGatewayToken);
    env.QWEN_HOME = managedProviderHome("qwen", terminalId);
    env.QWEN_RUNTIME_DIR = join(env.QWEN_HOME, "runtime");
    const qwenSandboxed = normalizePermissionMode(permissionMode) !== "full";
    env.QWEN_CODE_SYSTEM_SETTINGS_PATH = configureManagedQwenHome(
      env.QWEN_HOME,
      model,
      qwenSandboxed
    );
    env.NODE_OPTIONS = `--require=${writeQwenDockerEnvGuard(env.QWEN_HOME)}`;
    env.QWEN_SANDBOX = qwenSandboxed ? "true" : "false";
    env.QWEN_CODE_SUPPRESS_YOLO_WARNING = "1";
  }
  if (agent === "vibyra" && selectedRuntime === "kimi") {
    stripProviderCredentials(env);
    env.VIBYRA_TERMINAL_GATEWAY_TOKEN = String(terminalGatewayToken);
    env.KIMI_CODE_HOME = managedProviderHome("kimi", terminalId);
    env.KIMI_CODE_NO_AUTO_UPDATE = "1";
    env.KIMI_DISABLE_TELEMETRY = "1";
    configureManagedKimiHome(env.KIMI_CODE_HOME, model, terminalGatewayToken);
  }
  if (agent === "vibyra" && selectedRuntime === "mistral") {
    stripProviderCredentials(env);
    env.VIBYRA_TERMINAL_GATEWAY_TOKEN = String(terminalGatewayToken);
    env.VIBE_HOME = managedProviderHome("mistral", terminalId);
    configureManagedMistralHome(env.VIBE_HOME, model, cwd);
  }
  if (agent === "vibyra" && selectedRuntime === "grok") {
    stripProviderCredentials(env);
    env.VIBYRA_TERMINAL_GATEWAY_TOKEN = String(terminalGatewayToken);
    env.GROK_HOME = managedProviderHome("grok", terminalId);
    env.GROK_TELEMETRY_ENABLED = "false";
    configureManagedGrokHome(env.GROK_HOME, model);
  }
  if (agent === "gemini" && geminiSettingsPath) {
    env.GEMINI_CLI_SYSTEM_SETTINGS_PATH = geminiSettingsPath;
  }
  return env;
}

function writeQwenDockerEnvGuard(dir) {
  const target = join(dir, "vibyra-docker-env-guard.cjs");
  const source = `'use strict';
const childProcess = require('node:child_process');
const path = require('node:path');
delete process.env.NODE_OPTIONS;
function guardedArgs(command, args) {
  if (!Array.isArray(args) || !['docker', 'podman'].includes(path.basename(String(command || '')))) return args;
  const secret = String(process.env.OPENAI_API_KEY || '');
  if (!secret) return args;
  return args.map((value) => value === 'OPENAI_API_KEY=' + secret ? 'OPENAI_API_KEY' : value);
}
for (const name of ['spawn', 'spawnSync', 'execFile', 'execFileSync']) {
  const original = childProcess[name];
  childProcess[name] = function guardedChildProcess(command, args, ...rest) {
    return original.call(this, command, guardedArgs(command, args), ...rest);
  };
}
`;
  writeFileSync(target, source, { mode: 0o600 });
  try { chmodSync(target, 0o600); } catch {}
  return target;
}

function embeddedCodexHome(terminalId, options = {}) {
  const root = String(process.env.VIBYRA_CODEX_HOME_ROOT || "").trim()
    || join(homedir(), ".vibyra-agent", "codex-terminals");
  const dir = join(root, safePathPart(terminalId || `codex-${process.pid}`));
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  try { chmodSync(root, 0o700); } catch {}
  try { chmodSync(dir, 0o700); } catch {}
  seedCodexHome(dir, options);
  return dir;
}

function managedProviderHome(provider, terminalId) {
  const dir = join(
    homedir(),
    ".vibyra-agent",
    `${safePathPart(provider)}-terminals`,
    safePathPart(terminalId || `${provider}-${process.pid}`)
  );
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  try { chmodSync(dir, 0o700); } catch {}
  return dir;
}

function configureManagedClaudeHome(dir, cwd, model) {
  const statePath = join(dir, ".claude.json");
  let state = {};
  try {
    state = JSON.parse(readFileSync(statePath, "utf8"));
  } catch {}
  const workspace = resolve(String(cwd || process.cwd()));
  state = {
    ...state,
    installMethod: "vibyra-managed",
    hasCompletedOnboarding: true,
    lastOnboardingVersion: "2.1.169",
    projects: {
      ...(state.projects && typeof state.projects === "object" ? state.projects : {}),
      [workspace]: {
        ...(state.projects?.[workspace] || {}),
        hasTrustDialogAccepted: true,
        projectOnboardingSeenCount: 1
      }
    }
  };
  writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
  writeFileSync(join(dir, "settings.json"), `${JSON.stringify({
    theme: "dark",
    skipDangerousModePermissionPrompt: true,
    model: String(model || ""),
    availableModels: [String(model || "")].filter(Boolean)
  }, null, 2)}\n`, { mode: 0o600 });
}

function configureManagedGeminiSettings(dir, sourcePath) {
  let settings = {};
  try {
    settings = JSON.parse(readFileSync(sourcePath, "utf8"));
  } catch {}
  settings = {
    ...settings,
    security: {
      ...(settings.security || {}),
      auth: {
      ...(settings.security?.auth || {}),
        // Gemini CLI 0.46 supports gateway transport but its interactive
        // validator rejects "gateway". API-key auth still honors the custom
        // GOOGLE_GEMINI_BASE_URL and keeps the scoped key on Vibyra's gateway.
        selectedType: "gemini-api-key",
        enforcedType: "gemini-api-key"
      },
      folderTrust: {
        ...(settings.security?.folderTrust || {}),
        enabled: false
      }
    },
    telemetry: {
      ...(settings.telemetry || {}),
      enabled: false
    }
  };
  const configDir = join(dir, ".gemini");
  mkdirSync(configDir, { recursive: true, mode: 0o700 });
  const path = join(configDir, "vibyra-system-settings.json");
  writeFileSync(path, `${JSON.stringify(settings, null, 2)}\n`, { mode: 0o600 });
  return path;
}

function configureManagedGrokHome(dir, model) {
  const nativeModel = String(model || "").trim();
  const config = `[cli]
auto_update = false

[models]
default = ${tomlString(nativeModel)}
web_search = ${tomlString(nativeModel)}

[ui]
simple_mode = true
default_selected_permission = "allow_once"

[features]
telemetry = false
feedback = false

[session]
load_envrc = false

[model.${tomlBareKey(nativeModel)}]
model = ${tomlString(nativeModel)}
base_url = ${tomlString(`http://127.0.0.1:${PORT}/desktop/grok/v1`)}
name = "Grok via Vibyra"
env_key = "VIBYRA_TERMINAL_GATEWAY_TOKEN"
api_backend = "chat_completions"
context_window = 200000
`;
  const target = join(dir, "config.toml");
  writeFileSync(target, config, { mode: 0o600 });
  try { chmodSync(target, 0o600); } catch {}
}

function configureManagedQwenHome(dir, model, sandboxed) {
  const nativeModel = String(model || "").trim();
  const gatewayHost = sandboxed ? "host.docker.internal" : "127.0.0.1";
  const settings = {
    modelProviders: {
      openai: [{
        id: nativeModel,
        name: nativeModel,
        baseUrl: `http://${gatewayHost}:${PORT}/desktop/qwen/v1`,
        envKey: "OPENAI_API_KEY"
      }]
    },
    security: {
      auth: {
        selectedType: "openai",
        enforcedType: "openai"
      },
      folderTrust: { enabled: false }
    },
    model: { name: nativeModel },
    general: { enableAutoUpdate: false },
    privacy: { usageStatisticsEnabled: false },
    telemetry: { enabled: false },
    mcpServers: {},
    hooks: { enabled: false },
    extensions: { disabled: true }
  };
  mkdirSync(join(dir, "runtime"), { recursive: true, mode: 0o700 });
  const target = join(dir, "settings.json");
  writeFileSync(target, `${JSON.stringify(settings, null, 2)}\n`, { mode: 0o600 });
  return target;
}

function configureManagedKimiHome(dir, model, terminalGatewayToken) {
  const nativeModel = String(model || "").trim();
  const config = `default_model = "vibyra-selected"
default_permission_mode = "manual"
merge_all_available_skills = false
telemetry = false

[providers.vibyra]
type = "openai_responses"
base_url = ${tomlString(`http://127.0.0.1:${PORT}/desktop/kimi/v1`)}
api_key = ${tomlString(terminalGatewayToken)}

[models.vibyra-selected]
provider = "vibyra"
model = ${tomlString(nativeModel)}
max_context_size = 262144
`;
  writeFileSync(join(dir, "config.toml"), config, { mode: 0o600 });
  writeFileSync(join(dir, "tui.toml"), "[upgrade]\nauto_install = false\n", { mode: 0o600 });
}

function configureManagedMistralHome(dir, model, cwd) {
  const nativeModel = String(model || "").trim();
  const modelAlias = `${nativeModel}-vibyra`;
  const config = `active_model = ${tomlString(modelAlias)}
enable_telemetry = false
enable_update_checks = false
enable_notifications = false
enable_connectors = false
voice_mode_enabled = false
narrator_enabled = false
enable_experimental_hooks = false
vibe_code_enabled = false
autocopy_to_clipboard = false
enabled_skills = ["vibe"]

[experiments]
enable = false

[[providers]]
name = "vibyra"
api_base = ${tomlString(`http://127.0.0.1:${PORT}/desktop/mistral/v1`)}
api_key_env_var = "VIBYRA_TERMINAL_GATEWAY_TOKEN"
api_style = "openai-responses"
backend = "generic"

[[models]]
name = ${tomlString(nativeModel)}
provider = "vibyra"
alias = ${tomlString(modelAlias)}
temperature = 0.2
thinking = "high"
`;
  writeFileSync(join(dir, "config.toml"), config, { mode: 0o600 });
  writeFileSync(
    join(dir, "trusted_folders.toml"),
    `trusted = []\nuntrusted = [${tomlString(resolve(String(cwd || process.cwd())))}]\n`,
    { mode: 0o600 }
  );
}

function seedCodexHome(targetDir, options = {}) {
  const sourceDir = String(process.env.CODEX_HOME || "").trim() || join(homedir(), ".codex");
  if (!existsSync(sourceDir) || sourceDir === targetDir) return;
  if (!options.includeUserConfig) {
    for (const name of ["auth.json", "config.toml", "requirements.toml", "skills", "plugins"]) {
      rmSync(join(targetDir, name), { recursive: true, force: true });
    }
    return;
  }
  if (!options.includeAuth) rmSync(join(targetDir, "auth.json"), { force: true });
  const names = [
    "config.toml",
    "requirements.toml",
    "AGENTS.md",
    "skills",
    "plugins",
    "models_cache.json",
    "version.json",
    "installation_id",
    ".personality_migration"
  ];
  if (options.includeAuth) names.unshift("auth.json");
  for (const name of names) {
    const source = join(sourceDir, name);
    const target = join(targetDir, name);
    if (!existsSync(source) || existsSync(target)) continue;
    try {
      cpSync(source, target, { recursive: true, errorOnExist: false });
      if (name === "auth.json") chmodSync(target, 0o600);
    } catch {}
  }
  seedSharedCodexMarketplace(sourceDir, targetDir);
}

function seedSharedCodexMarketplace(sourceDir, targetDir) {
  const source = join(sourceDir, ".tmp", "plugins");
  const tempDir = join(targetDir, ".tmp");
  const target = join(tempDir, "plugins");
  if (!existsSync(source) || existsSync(target)) return;
  try {
    mkdirSync(tempDir, { recursive: true, mode: 0o700 });
    symlinkSync(source, target, "dir");
  } catch {}
}

function writeVibyraCodexConfig(targetDir, cwd) {
  const workspace = resolve(String(cwd || process.cwd()));
  const config = `[projects.${tomlString(workspace)}]\ntrust_level = "trusted"\n`;
  const target = join(targetDir, "config.toml");
  writeFileSync(target, config, { mode: 0o600 });
  try { chmodSync(target, 0o600); } catch {}
}

function writeVibyraAgentInstructions(targetDir) {
  const target = join(targetDir, "vibyra-agent-instructions.md");
  writeFileSync(target, `${VIBYRA_AGENT_MODEL_INSTRUCTIONS}\n`, { mode: 0o600 });
  try { chmodSync(target, 0o600); } catch {}
  return target;
}

function stripProviderCredentials(env) {
  for (const key of Object.keys(env)) {
    if (
      /^(?:ANTHROPIC|AWS|AZURE|COHERE|DEEPSEEK|FIREWORKS|GEMINI|GOOGLE|GROK|GROQ|KIMI|MISTRAL|MOONSHOT|NVIDIA|OPENAI|OPENROUTER|PERPLEXITY|QWEN|TOGETHER|XAI)_/i.test(key)
      || /(?:^|_)(?:API_KEY|ACCESS_KEY_ID|SECRET_ACCESS_KEY|AUTH_TOKEN|ACCESS_TOKEN|SESSION_TOKEN|BEARER_TOKEN|CLIENT_SECRET|PRIVATE_KEY|PASSWORD|TOKEN)$/i.test(key)
    ) {
      delete env[key];
    }
  }
}

function tomlString(value) {
  return JSON.stringify(String(value));
}

function tomlBareKey(value) {
  const key = String(value || "").trim();
  return /^[A-Za-z0-9_-]+$/.test(key) ? key : tomlString(key);
}

function normalizePermissionMode(value) {
  return String(value || "").toLowerCase() === "full" ? "full" : "standard";
}

export function terminalSessionCommand({ status, launch, shell, cols, rows }) {
  const prelude = `stty rows ${integer(rows, 30)} cols ${integer(cols, 100)} 2>/dev/null || true`;
  const shellOnly = `${prelude}\nstty sane echo icanon isig opost onlcr 2>/dev/null || true\nexec ${shellQuote(shell)} -i`;
  const providerThenShell = `${prelude}
${launch}
code=$?
printf '\\r\\n[AI provider exited. Project shell ready.]\\r\\n'
stty sane echo icanon isig opost onlcr 2>/dev/null || true
exec ${shellQuote(shell)} -i`;
  const inner = status.commandPath ? providerThenShell : shellOnly;
  return `exec ${shellQuote(shell)} -i -c ${shellQuote(inner)}`;
}

function vibyraCommandDir() {
  if (vibyraCommandDir.path) return vibyraCommandDir.path;
  const dir = mkdtempSync(join(tmpdir(), "vibyra-terminal-"));
  const file = join(dir, "vibyra");
  writeFileSync(file, vibyraCommandScript(), { mode: 0o755 });
  chmodSync(file, 0o755);
  vibyraCommandDir.path = dir;
  return dir;
}

function vibyraCommandScript() {
  return `#!/usr/bin/env bash
cmd="\${1:-help}"
if [ "$#" -gt 0 ]; then shift; fi
case "$cmd" in
  help|-h|--help)
    cat <<'HELP'
Vibyra terminal commands
  vibyra files [name]       Find files in this workspace.
  vibyra research "topic"   Print a deep-research prompt for the active AI agent.
  vibyra image "prompt"     Print an image-generation prompt for the active AI agent.
  vibyra plan "goal"        Print a planning prompt for the active AI agent.
  vibyra clear              Clear this terminal.
HELP
    ;;
  files|file|find)
    query="$*"
    results="$(find . \\
      -path '*/.git' -prune -o \\
      -path '*/node_modules' -prune -o \\
      -path '*/.expo' -prune -o \\
      -path '*/backend/vendor' -prune -o \\
      -type f -print 2>/dev/null | sed 's#^./##' | sort)"
    if [ -n "$query" ]; then results="$(printf '%s\\n' "$results" | grep -i -- "$query" 2>/dev/null)"; fi
    if [ -n "$results" ]; then printf '%s\\n' "$results" | head -80; else printf 'No files found.\\n'; fi
    ;;
  research|deep-research|deep)
    topic="$*"
    [ -n "$topic" ] || topic="<topic>"
    printf 'Deep research prompt:\\nResearch %s thoroughly. Compare sources, call out uncertainty, and finish with actionable next steps.\\n' "$topic"
    ;;
  image|img)
    prompt="$*"
    [ -n "$prompt" ] || prompt="<image prompt>"
    printf 'Image prompt:\\nCreate a polished image for: %s\\nInclude style, composition, lighting, colors, and output size.\\n' "$prompt"
    ;;
  plan)
    goal="$*"
    [ -n "$goal" ] || goal="<goal>"
    printf 'Plan prompt:\\nMake a concise implementation plan for: %s\\nInclude risks, files to inspect, and verification steps before editing.\\n' "$goal"
    ;;
  clear|cls)
    printf '\\033c'
    ;;
  *)
    printf 'Unknown Vibyra command: %s\\nRun: vibyra help\\n' "$cmd"
    exit 2
    ;;
esac
`;
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, "'\\''")}'`;
}

function integer(value, fallback) {
  const numeric = Number.parseInt(String(value || ""), 10);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function safePathPart(value) {
  return String(value || "terminal").replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 120) || "terminal";
}
