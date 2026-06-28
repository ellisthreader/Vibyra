import { execFileSync, spawn } from "node:child_process";
import { accessSync, constants, existsSync, readFileSync, readdirSync, readlinkSync } from "node:fs";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { delimiter, dirname, join, resolve, win32 } from "node:path";
import { fileURLToPath } from "node:url";
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
const moduleDir = dirname(fileURLToPath(import.meta.url));
const bundledNodeModules = resolve(moduleDir, "..", "..", "node_modules");
const require = createRequire(import.meta.url);

const AGENT_CONFIG = {
  shell: { label: "Shell", command: "", args: [], env: [], install: "" },
  vibyra: { label: "Vibyra", command: "codex", args: ["--no-alt-screen"], env: ["VIBYRA_CODEX_CLI", "CODEX_CLI_PATH"], install: "Install the managed Codex CLI to run Vibyra terminals." },
  "vibyra-agent": { label: "Vibyra Agent", command: "vibyra-agent", args: [VIBYRA_AGENT_ENTRY_PATH], env: [], install: "Reinstall Vibyra Desktop to restore the bundled Vibyra Agent runtime." },
  codex: { label: "Codex", command: "codex", args: ["--no-alt-screen"], env: ["VIBYRA_CODEX_CLI", "CODEX_CLI_PATH"], install: "Install the Codex CLI or set VIBYRA_CODEX_CLI to its executable path." },
  claude: { label: "Claude", command: "claude", args: [], env: ["VIBYRA_CLAUDE_CLI", "CLAUDE_CLI_PATH"], install: "Install Claude Code or set VIBYRA_CLAUDE_CLI to its executable path." },
  gemini: { label: "Gemini", command: "gemini", args: [], env: ["VIBYRA_GEMINI_CLI", "GEMINI_CLI_PATH"], install: "Install the Gemini CLI so `gemini` is on PATH, or set VIBYRA_GEMINI_CLI to its executable path." },
  qwen: { label: "Qwen Code", command: "qwen", args: [], env: ["VIBYRA_QWEN_CLI", "QWEN_CLI_PATH"], install: "Download Qwen Code from the model picker or set VIBYRA_QWEN_CLI to its executable path." },
  kimi: { label: "Kimi Code", command: "kimi", args: [], env: ["VIBYRA_KIMI_CLI", "KIMI_CLI_PATH"], install: "Download Kimi Code from the model picker or set VIBYRA_KIMI_CLI to its executable path." },
  mistral: { label: "Mistral Vibe", command: "vibe", runtimeId: "mistral", args: [], env: ["VIBYRA_MISTRAL_CLI", "MISTRAL_VIBE_PATH"], install: "Download Mistral Vibe from the model picker or set VIBYRA_MISTRAL_CLI to its executable path." },
  grok: { label: "Grok Build", command: "grok", args: ["--no-auto-update", "--no-alt-screen"], env: ["VIBYRA_GROK_CLI", "GROK_CLI_PATH"], install: "Download Grok Build from the model picker or set VIBYRA_GROK_CLI to its executable path." }
};

export function spawnAiTerminalProcess({ agent = "vibyra", model = "", launchPlan = null, reasoningEffort = "medium", permissionMode = "standard", sandboxMode = "", tokenMode = "vibyra", projectId = "", terminalId = "", terminalGatewayToken = "", memoryInstructions = "", roleInstructions = "", geminiSettingsPath = "", cwd = process.cwd(), cols = 100, rows = 30, onData, onExit }) {
  const shell = process.env.SHELL || "/bin/bash";
  assertLaunchPlanMatchesAgent(agent, model, launchPlan, tokenMode);
  const status = aiTerminalAgentStatus(agent, model, launchPlan?.runtimeId);
  const runtimeModel = launchPlan?.runtimeId && launchPlan.runtimeId !== "codex"
    ? launchPlan.nativeModel
    : model;
  const launchOptions = {
    model: runtimeModel,
    modelMigration: codexModelMigration(runtimeModel),
    deferMcpTools: agent === "codex" && bundledCodexExecutable(status.commandPath),
    reasoningEffort,
    permissionMode,
    sandboxMode: sandboxMode || launchPlan?.sandboxMode,
    memoryInstructions,
    roleInstructions,
    cwd
  };
  const launch = launchCommand(status, shell, launchOptions);
  const env = terminalEnv({ agent: status.key, runtimeId: status.runtimeId, label: status.label, model: runtimeModel, reasoningEffort, permissionMode, sandboxMode: sandboxMode || launchPlan?.sandboxMode, tokenMode, projectId, terminalId, terminalGatewayToken, memoryInstructions, roleInstructions, geminiSettingsPath, agentEnginePath: status.agentEnginePath, cwd, cols, rows });
  if (["qwen", "kimi"].includes(status.runtimeId) && status.commandPath) {
    env.PATH = `${dirname(status.commandPath)}${delimiter}${env.PATH || ""}`;
  }
  if (process.platform === "win32" && status.key === "shell") {
    const parts = windowsShellCommandParts();
    const child = spawn(parts.command, parts.args, {
      cwd,
      env,
      stdio: "pipe",
      windowsHide: true
    });
    attachProcess(child, onData, onExit);
    return child;
  }
  if (process.platform === "win32" && windowsNativeProviderRequiresPty(status)) {
    const parts = terminalLaunchCommandParts(status, launchOptions);
    return spawnWindowsPtyProcess({ parts, cwd, env, cols, rows, onData, onExit });
  }
  if (process.platform === "win32" && status.commandPath) {
    const launchParts = terminalLaunchCommandParts(status, launchOptions);
    const parts = windowsProcessLaunchParts(launchParts.command, launchParts.args);
    const child = spawn(parts.command, parts.args, {
      cwd,
      env,
      stdio: "pipe",
      shell: parts.shell,
      windowsHide: parts.windowsHide
    });
    attachProcess(child, onData, onExit);
    return child;
  }
  const command = terminalSessionCommand({ status, launch, shell, cols, rows });

  if (existsSync("/usr/bin/script")) {
    return spawnWithScript({ command, cwd, env, cols, rows, onData, onExit });
  }

  const child = spawn(shell, ["-lc", command], { cwd, env, stdio: "pipe", windowsHide: true });
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
    qwen: {
      providerId: "qwen",
      adapterId: "openai-chat-completions",
      protocol: "openai-chat-completions"
    },
    kimi: {
      providerId: "moonshot",
      adapterId: "responses",
      protocol: "openai-responses"
    },
    mistral: {
      providerId: "mistral",
      adapterId: "responses",
      protocol: "openai-responses"
    },
    grok: {
      providerId: "x-ai",
      adapterId: "openai-chat-completions",
      protocol: "openai-chat-completions"
    },
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
  return ["vibyra", "codex", "claude", "gemini", "qwen", "kimi", "mistral", "grok", "shell"]
    .map((agent) => aiTerminalAgentStatus(agent));
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
  const killScript = child.kill.bind(child);
  child.kill = (signal = "SIGTERM") => {
    const session = scriptSession(child.pid);
    if (session) killLinuxProcessTree(session.pid, signal);
    return killScript(signal);
  };
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

function killLinuxProcessTree(rootPid, signal) {
  const descendants = descendantProcessIds(rootPid);
  for (const pid of descendants.reverse()) {
    try { process.kill(pid, signal); } catch {}
  }
  try { process.kill(-rootPid, signal); } catch {}
  try { process.kill(rootPid, signal); } catch {}
}

function descendantProcessIds(rootPid) {
  if (process.platform !== "linux") return [];
  const childrenByParent = new Map();
  try {
    for (const entry of readdirSync("/proc", { withFileTypes: true })) {
      if (!entry.isDirectory() || !/^\d+$/.test(entry.name)) continue;
      const pid = Number(entry.name);
      if (pid === process.pid) continue;
      const stat = readFileSync(`/proc/${entry.name}/stat`, "utf8");
      const closeParen = stat.lastIndexOf(")");
      const fields = stat.slice(closeParen + 2).trim().split(/\s+/);
      const parentPid = Number(fields[1]);
      if (!childrenByParent.has(parentPid)) childrenByParent.set(parentPid, []);
      childrenByParent.get(parentPid).push(pid);
    }
  } catch {}
  const ids = [];
  const pending = [...(childrenByParent.get(rootPid) || [])];
  while (pending.length) {
    const pid = pending.shift();
    ids.push(pid);
    pending.push(...(childrenByParent.get(pid) || []));
  }
  return ids;
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
  const managed = terminalRuntimeExecutable(config.runtimeId || config.command);
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

function tomlString(value) {
  return JSON.stringify(String(value));
}

function integer(value, fallback) {
  const numeric = Number.parseInt(String(value || ""), 10);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function launchCommand(status, shell, options = {}) {
  const parts = terminalLaunchCommandParts(status, options);
  if (!parts.command) return `${shellQuote(shell)} -l`;
  return [parts.command, ...parts.args].map(shellQuote).join(" ");
}

function spawnWindowsPtyProcess({ parts, cwd, env, cols, rows, onData, onExit }) {
  let nodePty;
  try {
    nodePty = require("node-pty");
  } catch (error) {
    onData?.(`\r\nThe Windows PTY backend could not start: ${error.message}\r\n`);
    onExit?.({ code: 1, signal: "" });
    return exitedChildLikeProcess();
  }
  const launch = windowsPtyLaunchParts(parts.command, parts.args);
  let terminal;
  try {
    terminal = nodePty.spawn(launch.command, launch.args, {
      name: "xterm-256color",
      cols: integer(cols, 100),
      rows: integer(rows, 30),
      cwd,
      env,
      windowsHide: true
    });
  } catch (error) {
    onData?.(`\r\nThe Windows PTY backend could not launch ${parts.command}: ${error.message}\r\n`);
    onExit?.({ code: 1, signal: "" });
    return exitedChildLikeProcess();
  }
  return wrapWindowsPtyProcess(terminal, onData, onExit);
}

function wrapWindowsPtyProcess(terminal, onData, onExit) {
  let exited = false;
  terminal.onData((data) => onData?.(String(data || "")));
  terminal.onExit(({ exitCode, signal }) => {
    exited = true;
    onExit?.({ code: exitCode, signal: signal || "" });
  });
  return {
    pid: terminal.pid,
    stdin: {
      get writable() {
        return !exited;
      },
      write(data, callback) {
        if (exited) {
          callback?.(new Error("The terminal process has exited."));
          return false;
        }
        try {
          terminal.write(String(data ?? ""));
          callback?.();
          return true;
        } catch (error) {
          callback?.(error);
          return false;
        }
      }
    },
    resize(cols, rows) {
      if (exited) return;
      terminal.resize(integer(cols, 100), integer(rows, 30));
    },
    kill(signal = "SIGTERM") {
      if (exited) return false;
      terminal.kill(signal);
      return true;
    }
  };
}

function exitedChildLikeProcess() {
  return {
    pid: null,
    stdin: {
      writable: false,
      write(_data, callback) {
        callback?.(new Error("The terminal process has exited."));
        return false;
      }
    },
    resize() {},
    kill() { return false; }
  };
}

export function terminalLaunchCommandParts(status, options = {}) {
  if (!status.commandPath) return { command: "", args: [] };
  const argumentAgent = status.key === "vibyra" && status.runtimeId !== "codex"
    ? status.runtimeId
    : status.key;
  const args = aiTerminalAgentArgs(argumentAgent, options);
  assertAiTerminalLaunchOwnership(status, args);
  return { command: status.commandPath, args };
}

export function windowsProcessLaunchParts(command, args = []) {
  return { command, args, shell: windowsCommandScript(command), windowsHide: true };
}

export function windowsNativeProviderRequiresPty(status = {}) {
  return Boolean(status.commandPath)
    && status.key !== "shell"
    && status.runtimeId !== "vibyra-agent"
    && windowsNativeCommandTarget(status.commandPath);
}

export function windowsPtyLaunchParts(command, args = [], environment = process.env) {
  return { command, args };
}

function windowsCommandScript(command) {
  return /\.(?:cmd|bat)$/i.test(String(command || ""));
}

function windowsNativeCommandTarget(command) {
  return /\.(?:cmd|bat|com|exe)$/i.test(String(command || ""));
}

export function windowsShellCommandParts(environment = process.env, exists = existsSync) {
  const root = environment.SystemRoot || environment.windir || "C:\\Windows";
  const powershell = win32.join(root, "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
  if (exists(powershell)) {
    return {
      command: powershell,
      args: ["-NoLogo", "-NoProfile", "-ExecutionPolicy", "Bypass"]
    };
  }
  return {
    command: environment.ComSpec || win32.join(root, "System32", "cmd.exe"),
    args: ["/d", "/q"]
  };
}

export function aiTerminalAgentArgs(agent, options = {}) {
  const key = AGENT_CONFIG[agent] ? agent : "vibyra";
  if (key === "vibyra" && String(options.model || "").trim().toLowerCase() === "auto") {
    throw new Error("Auto must route to a concrete native provider before process launch.");
  }
  const args = [...(AGENT_CONFIG[key].args || [])];
  const memoryInstructions = String(options.memoryInstructions || "").trim();
  const roleInstructions = String(options.roleInstructions || "").trim();
  if (key === "claude" && roleInstructions) {
    args.push("--append-system-prompt", roleInstructions);
  } else if (key === "claude" && memoryInstructions) {
    args.push("--append-system-prompt", memoryInstructions);
  }
  if (["claude", "gemini", "qwen", "kimi", "mistral", "grok"].includes(key)) {
    const model = nativeCliModelName(options.model, key);
    if (model && !["kimi", "mistral"].includes(key)) args.push("--model", model);
    if (normalizeSandboxMode(options.sandboxMode, options.permissionMode) === "read-only") {
      if (key === "claude") {
        args.push("--permission-mode", "plan", "--tools", "Read,Glob,Grep", "--disable-slash-commands", "--strict-mcp-config");
      } else if (key === "gemini") {
        args.push("--approval-mode", "plan");
      } else if (key === "qwen") {
        args.push("--approval-mode", "plan", "--sandbox");
      } else if (key === "kimi") {
        args.push("--plan");
      } else if (key === "mistral") {
        args.push("--agent", "plan");
      } else {
        throw new Error(`${AGENT_CONFIG[key].label} cannot enforce this Team capability.`);
      }
    } else if (normalizePermissionMode(options.permissionMode) === "full") {
      if (key === "claude") args.push("--dangerously-skip-permissions");
      if (key === "gemini") args.push("--approval-mode", "yolo", "--no-sandbox");
      if (key === "qwen") args.push("--approval-mode", "yolo");
      if (key === "kimi") args.push("--yolo");
      if (key === "mistral") args.push("--agent", "auto-approve");
      if (key === "grok") args.push("--permission-mode", "bypassPermissions", "--sandbox", "off");
    } else if (key === "qwen") {
      args.push("--approval-mode", "default", "--sandbox");
    } else if (key === "mistral") {
      args.push("--agent", "default");
    } else if (key === "grok") {
      args.push("--permission-mode", "default", "--sandbox", "workspace");
    }
    return args;
  }
  if (key === "vibyra-agent") return args;
  if (key !== "codex" && key !== "vibyra") return args;
  const model = key === "vibyra"
    ? String(options.model || "auto").trim() || "auto"
    : codexModelName(options.model);
  if (model && (key === "vibyra" || model !== "auto")) args.push("--model", model);
  const migration = options.modelMigration;
  if (migration?.from === model && migration.to) {
    args.push(
      "-c",
      `notice.model_migrations={${tomlString(migration.from)}=${tomlString(migration.to)}}`
    );
  }
  if (key === "codex" && options.deferMcpTools) {
    args.push("--enable", "tool_search_always_defer_mcp_tools");
  }
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
  if (roleInstructions) args.push("-c", `developer_instructions=${JSON.stringify(roleInstructions)}`);
  const sandboxMode = normalizeSandboxMode(options.sandboxMode, options.permissionMode);
  if (sandboxMode === "read-only") {
    args.push("--sandbox", "read-only", "--ask-for-approval", "never");
  } else if (normalizePermissionMode(options.permissionMode) === "full") {
    args.push("--dangerously-bypass-approvals-and-sandbox");
  } else if (key === "vibyra") {
    args.push("--sandbox", "workspace-write", "--ask-for-approval", "on-request");
  }
  return args;
}

function normalizeSandboxMode(value, permissionMode) {
  const mode = String(value || "").trim().toLowerCase();
  if (["read-only", "workspace-write", "danger-full-access"].includes(mode)) return mode;
  return normalizePermissionMode(permissionMode) === "full"
    ? "danger-full-access"
    : "workspace-write";
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

function bundledCodexExecutable(path) {
  const executable = resolve(String(path || ""));
  return executable.startsWith(`${bundledNodeModules}/`);
}

export function codexModelMigration(value, codexHome = "") {
  const model = codexModelName(value);
  if (!model || model === "auto") return null;
  const defaultHome = join(homedir(), ".codex");
  const requestedHome = String(codexHome || process.env.CODEX_HOME || "").trim();
  const homes = [...new Set([requestedHome, defaultHome].filter(Boolean))];
  for (const home of homes) {
    try {
      const cache = JSON.parse(readFileSync(join(home, "models_cache.json"), "utf8"));
      const source = Array.isArray(cache?.models)
        ? cache.models.find((item) => String(item?.slug || "") === model)
        : null;
      const target = String(source?.upgrade?.model || "").trim();
      if (target && target !== model) return { from: model, to: target };
    } catch {
      // Fall through to the standard Codex home when an override is stale.
    }
  }
  return null;
}

function nativeCliModelName(value, agent) {
  const prefix = agent === "claude"
    ? /^anthropic\//i
    : agent === "grok"
      ? /^x-ai\//i
      : agent === "qwen"
        ? /^(?:qwen|alibaba)\//i
        : agent === "kimi"
          ? /^(?:moonshot|moonshotai|kimi)\//i
          : agent === "mistral"
            ? /^(?:mistral|mistralai)\//i
            : /^google\//i;
  return String(value || "").trim().replace(prefix, "");
}

function providerAgentForModel(value) {
  const model = String(value || "").trim().toLowerCase();
  if (model.startsWith("claude-") || model.startsWith("anthropic/")) return "claude";
  if (model.startsWith("gemini-") || model.startsWith("google/")) return "gemini";
  if (model.startsWith("qwen-") || model.startsWith("qwen2") || model.startsWith("qwen3") || model.startsWith("qwen/") || model.startsWith("alibaba/")) return "qwen";
  if (model.startsWith("kimi-") || model.startsWith("moonshot/") || model.startsWith("moonshotai/") || model.startsWith("kimi/")) return "kimi";
  if (/^(?:mistral-|ministral-|codestral-|devstral-|mistral\/|mistralai\/)/.test(model)) return "mistral";
  if (model.startsWith("grok-") || model.startsWith("x-ai/")) return "grok";
  if (model.startsWith("gpt-") || model.startsWith("openai/") || model.includes("codex")) return "codex";
  return "";
}
