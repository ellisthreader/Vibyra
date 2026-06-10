import { execFileSync, spawn } from "node:child_process";
import { accessSync, constants, existsSync, readFileSync, readlinkSync } from "node:fs";
import { delimiter } from "node:path";
import { assertAiTerminalLaunchOwnership } from "./aiTerminalLaunchOwnership.mjs";
import {
  AI_TERMINAL_LAUNCH_CONTRACT_VERSION,
  terminalProviderIdForModel
} from "./aiTerminalProviderAdapters.mjs";
import { VIBYRA_AGENT_ENTRY_PATH } from "./aiTerminalRuntimeCatalog.mjs";
import { terminalEnv, terminalSessionCommand } from "./aiTerminalVibyraShell.mjs";
import { terminalRuntimeExecutable, terminalRuntimeForModel } from "./aiTerminalRuntimes.mjs";
import { PORT } from "./state.mjs";

const scriptResizeStates = new WeakMap();

const AGENT_CONFIG = {
  shell: { label: "Shell", command: "", args: [], env: [], install: "" },
  vibyra: { label: "Vibyra", command: "codex", args: ["--no-alt-screen"], env: ["VIBYRA_CODEX_CLI", "CODEX_CLI_PATH"], install: "Install the managed Codex CLI to run Vibyra terminals." },
  "vibyra-agent": { label: "Vibyra Agent", command: "vibyra-agent", args: [VIBYRA_AGENT_ENTRY_PATH], env: [], install: "Reinstall Vibyra Desktop to restore the bundled Vibyra Agent runtime." },
  codex: { label: "Codex", command: "codex", args: ["--no-alt-screen"], env: ["VIBYRA_CODEX_CLI", "CODEX_CLI_PATH"], install: "Install the Codex CLI or set VIBYRA_CODEX_CLI to its executable path." },
  claude: { label: "Claude", command: "claude", args: [], env: ["VIBYRA_CLAUDE_CLI", "CLAUDE_CLI_PATH"], install: "Install Claude Code or set VIBYRA_CLAUDE_CLI to its executable path." },
  gemini: { label: "Gemini", command: "gemini", args: [], env: ["VIBYRA_GEMINI_CLI", "GEMINI_CLI_PATH"], install: "Install the Gemini CLI so `gemini` is on PATH, or set VIBYRA_GEMINI_CLI to its executable path." }
};

export function spawnAiTerminalProcess({ agent = "vibyra", model = "", launchPlan = null, reasoningEffort = "medium", permissionMode = "standard", tokenMode = "vibyra", projectId = "", terminalId = "", terminalGatewayToken = "", memoryInstructions = "", geminiSettingsPath = "", cwd = process.cwd(), cols = 100, rows = 30, onData, onExit }) {
  const shell = process.env.SHELL || "/bin/bash";
  assertLaunchPlanMatchesAgent(agent, model, launchPlan, tokenMode);
  const status = aiTerminalAgentStatus(agent, model, launchPlan?.runtimeId);
  const runtimeModel = launchPlan?.runtimeId && launchPlan.runtimeId !== "codex"
    ? launchPlan.nativeModel
    : model;
  const launch = launchCommand(status, shell, { model: runtimeModel, reasoningEffort, permissionMode, memoryInstructions, cwd });
  const providerUiVersion = status.key === "vibyra" ? aiTerminalProviderVersion(model) : "";
  const env = terminalEnv({ agent: status.key, runtimeId: status.runtimeId, label: status.label, model: runtimeModel, reasoningEffort, permissionMode, tokenMode, projectId, terminalId, terminalGatewayToken, memoryInstructions, geminiSettingsPath, agentEnginePath: status.agentEnginePath, providerUiVersion, cwd, cols, rows });
  const command = terminalSessionCommand({ status, launch, shell, cols, rows });

  if (existsSync("/usr/bin/script")) {
    return spawnWithScript({ command, cwd, env, cols, rows, onData, onExit });
  }

  const child = spawn(shell, ["-lc", command], { cwd, env, stdio: "pipe" });
  attachProcess(child, onData, onExit);
  return child;
}

function assertLaunchPlanMatchesAgent(agent, model, launchPlan, tokenMode) {
  if (agent === "shell") return;
  if (!launchPlan || typeof launchPlan !== "object") {
    throw new Error("Blocked AI terminal launch without an immutable launch plan.");
  }
  const selectedModel = String(model || "").trim().toLowerCase();
  const selectedProviderId = terminalProviderIdForModel(selectedModel);
  if (
    launchPlan.billingMode !== tokenMode
    || launchPlan.launchContractVersion !== AI_TERMINAL_LAUNCH_CONTRACT_VERSION
    || launchPlan.providerId !== selectedProviderId
    || terminalRuntimeForModel(selectedModel) !== launchPlan.runtimeId
  ) {
    throw new Error("Blocked AI terminal launch with mismatched billing or model metadata.");
  }
  if (tokenMode === "provider") {
    const expected = {
      codex: { runtimeId: "codex", providerId: "openai" },
      claude: { runtimeId: "claude", providerId: "anthropic" },
      gemini: { runtimeId: "gemini", providerId: "google" }
    }[agent];
    if (!expected
      || launchPlan.runtimeId !== expected.runtimeId
      || launchPlan.providerId !== expected.providerId) {
      throw new Error("Blocked personal-account terminal launch with mismatched provider ownership.");
    }
    return;
  }
  const expected = {
    codex: { providerId: "openai", adapterId: "responses" },
    claude: { providerId: "anthropic", adapterId: "anthropic-messages" },
    gemini: { providerId: "google", adapterId: "gemini-generate-content" },
    "vibyra-agent": {
      providerId: launchPlan.providerId,
      adapterId: "responses",
      protocol: "openai-responses"
    }
  }[launchPlan.runtimeId];
  const allowedModels = Array.isArray(launchPlan.allowedModels)
    ? launchPlan.allowedModels
    : [];
  if (!expected
    || launchPlan.providerId !== expected.providerId
    || launchPlan.adapterId !== expected.adapterId
    || (expected.protocol && launchPlan.protocol !== expected.protocol)
    || (launchPlan.runtimeId === "vibyra-agent"
      && (
        launchPlan.nativeModel !== selectedModel
        || launchPlan.billingModel !== selectedModel
        || allowedModels.length !== 1
        || allowedModels[0] !== selectedModel
      ))) {
    throw new Error("Blocked AI terminal launch because this native provider adapter is not enabled.");
  }
}

export function aiTerminalProviderVersion(model = "") {
  const key = providerAgentForModel(model);
  if (!key) return "";
  const executable = resolveAgentExecutable(AGENT_CONFIG[key]);
  if (!executable) return "";
  try {
    const result = execFileSync(executable, ["--version"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 1500
    });
    return String(result || "").match(/\b\d+\.\d+\.\d+(?:[-+][a-z0-9.-]+)?\b/i)?.[0] || "";
  } catch {
    return "";
  }
}

export function listAiTerminalAgentStatuses() {
  return ["vibyra", "codex", "claude", "gemini", "shell"].map((agent) => aiTerminalAgentStatus(agent));
}

export function aiTerminalAgentStatus(agent = "vibyra", model = "", runtimeId = "") {
  const key = AGENT_CONFIG[agent] ? agent : "vibyra";
  const config = AGENT_CONFIG[key];
  const selectedRuntime = key === "vibyra"
    ? String(runtimeId || terminalRuntimeForModel(model) || "")
    : key;
  const managedConfig = AGENT_CONFIG[selectedRuntime];
  const agentEnginePath = key === "vibyra" && managedConfig
    ? resolveAgentExecutable(
      selectedRuntime === "vibyra-agent" ? AGENT_CONFIG.codex : managedConfig
    )
    : "";
  const commandPath = key === "vibyra"
    ? managedConfig ? resolveAgentExecutable(managedConfig) : ""
    : resolveAgentExecutable(config);
  const available = key === "shell"
    || Boolean(commandPath && (selectedRuntime !== "vibyra-agent" || agentEnginePath));
  return {
    key,
    label: config.label,
    available,
    command: config.command,
    commandPath,
    args: config.args || [],
    installHint: config.install,
    ...(key === "vibyra" ? {
      agentEnginePath,
      agentEngineAvailable: Boolean(agentEnginePath),
      runtimeId: selectedRuntime,
      launchMode: selectedRuntime === "vibyra-agent" ? "vibyra-agent" : "native-provider"
    } : {})
  };
}

function spawnWithScript({ command, cwd, env, cols, rows, onData, onExit }) {
  const ptyCommand = `stty rows ${integer(rows, 30)} cols ${integer(cols, 100)}; ${command}`;
  const child = spawn("/usr/bin/script", ["-qf", "-e", "-E", "never", "-c", ptyCommand, "/dev/null"], { cwd, env, stdio: "pipe" });
  child.resize = (nextCols, nextRows) => queueScriptPtyResize(child, nextCols, nextRows);
  attachProcess(child, onData, onExit);
  return child;
}

function queueScriptPtyResize(child, cols, rows) {
  const state = scriptResizeStates.get(child) || { running: false, pending: null };
  state.pending = { cols: integer(cols, 100), rows: integer(rows, 30) };
  scriptResizeStates.set(child, state);
  flushScriptPtyResize(child, state);
}

function flushScriptPtyResize(child, state, attempt = 0) {
  if (state.running || !state.pending) return;
  if (process.platform !== "linux" || !child?.pid || child.exitCode !== null) return;
  const size = state.pending;
  state.pending = null;
  const session = scriptSession(child.pid);
  if (!session) {
    state.pending = size;
    if (attempt < 3) setTimeout(() => flushScriptPtyResize(child, state, attempt + 1), 25 * (attempt + 1));
    return;
  }
  state.running = true;
  const resize = spawn("stty", [
    "-F",
    session.tty,
    "rows",
    String(size.rows),
    "cols",
    String(size.cols)
  ], { stdio: "ignore" });
  resize.once("close", (code) => {
    state.running = false;
    if (code === 0) {
      try { process.kill(-session.pid, "SIGWINCH"); } catch {}
    }
    flushScriptPtyResize(child, state);
  });
}

function scriptSession(scriptPid) {
  try {
    const childrenPath = `/proc/${scriptPid}/task/${scriptPid}/children`;
    const sessionPid = Number.parseInt(readFileSync(childrenPath, "utf8").trim().split(/\s+/)[0], 10);
    if (!Number.isInteger(sessionPid) || sessionPid <= 0) return null;
    const tty = readlinkSync(`/proc/${sessionPid}/fd/0`);
    if (!tty.startsWith("/dev/pts/")) return null;
    return { pid: sessionPid, tty };
  } catch {
    return null;
  }
}

function attachProcess(child, onData, onExit) {
  child.stdout?.on("data", (chunk) => onData?.(chunk.toString("utf8")));
  child.stderr?.on("data", (chunk) => onData?.(chunk.toString("utf8")));
  child.on("error", (error) => onData?.(`\r\n${error.message}\r\n`));
  child.on("close", (code, signal) => onExit?.({ code, signal }));
}

function resolveAgentExecutable(config) {
  if (!config.command) return "";
  for (const key of config.env) {
    const value = process.env[key]?.trim();
    if (value && canExecute(value)) return value;
  }
  if (config.command.includes("/") && canExecute(config.command)) return config.command;
  const managed = terminalRuntimeExecutable(config.command);
  if (managed) return managed;
  for (const dir of String(process.env.PATH || "").split(delimiter)) {
    const path = `${dir}/${config.command}`;
    if (canExecute(path)) return path;
  }
  return "";
}

function canExecute(path) {
  try {
    accessSync(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, "'\\''")}'`;
}

function integer(value, fallback) {
  const numeric = Number.parseInt(String(value || ""), 10);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function launchCommand(status, shell, options = {}) {
  if (!status.commandPath) return `${shellQuote(shell)} -l`;
  const argumentAgent = status.key === "vibyra" && status.runtimeId !== "codex"
    ? status.runtimeId
    : status.key;
  const args = aiTerminalAgentArgs(argumentAgent, options);
  assertAiTerminalLaunchOwnership(status, args);
  return [status.commandPath, ...args].map(shellQuote).join(" ");
}

export function aiTerminalAgentArgs(agent, options = {}) {
  const key = AGENT_CONFIG[agent] ? agent : "vibyra";
  if (key === "vibyra" && String(options.model || "").trim().toLowerCase() === "auto") {
    throw new Error("Auto must route to a concrete native provider before process launch.");
  }
  const args = [...(AGENT_CONFIG[key].args || [])];
  const memoryInstructions = String(options.memoryInstructions || "").trim();
  if (key === "claude" && memoryInstructions) {
    args.push("--append-system-prompt", memoryInstructions);
  }
  if (key === "claude" || key === "gemini") {
    const model = nativeCliModelName(options.model, key);
    if (model) args.push("--model", model);
    return args;
  }
  if (key === "vibyra-agent") return args;
  if (key !== "codex" && key !== "vibyra") return args;
  const model = key === "vibyra"
    ? String(options.model || "auto").trim() || "auto"
    : codexModelName(options.model);
  if (model && (key === "vibyra" || model !== "auto")) args.push("--model", model);
  if (key === "vibyra") {
    args.push(
      "-c",
      'model_provider="vibyra"',
      "-c",
      'model_providers.vibyra.name="Vibyra tokens"',
      "-c",
      `model_providers.vibyra.base_url="http://127.0.0.1:${PORT}/desktop/v1"`,
      "-c",
      'model_providers.vibyra.wire_api="responses"',
      "-c",
      'model_providers.vibyra.env_key="VIBYRA_TERMINAL_GATEWAY_TOKEN"'
    );
  }
  const effort = normalizeReasoningEffort(options.reasoningEffort);
  if (effort !== "default") args.push("-c", `model_reasoning_effort="${effort}"`);
  if (normalizePermissionMode(options.permissionMode) === "full") {
    args.push("--dangerously-bypass-approvals-and-sandbox");
  } else if (key === "vibyra") {
    args.push("--sandbox", "workspace-write", "--ask-for-approval", "on-request");
  }
  return args;
}

function normalizeReasoningEffort(value) {
  const effort = String(value || "medium").toLowerCase();
  return ["default", "low", "medium", "high", "xhigh"].includes(effort) ? effort : "medium";
}

function normalizePermissionMode(value) {
  return String(value || "").toLowerCase() === "full" ? "full" : "standard";
}

function codexModelName(value) {
  return String(value || "").trim().replace(/^openai\//i, "");
}

function nativeCliModelName(value, agent) {
  const prefix = agent === "claude" ? /^anthropic\//i : /^google\//i;
  return String(value || "").trim().replace(prefix, "");
}

function providerAgentForModel(value) {
  const model = String(value || "").trim().toLowerCase();
  if (model.startsWith("claude-") || model.startsWith("anthropic/")) return "claude";
  if (model.startsWith("gemini-") || model.startsWith("google/")) return "gemini";
  if (model.startsWith("gpt-") || model.startsWith("openai/") || model.includes("codex")) return "codex";
  return "";
}
