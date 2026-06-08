import { spawn } from "node:child_process";
import { accessSync, constants, existsSync, readFileSync, readlinkSync } from "node:fs";
import { delimiter, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { terminalEnv, terminalSessionCommand } from "./aiTerminalVibyraShell.mjs";

const moduleDir = dirname(fileURLToPath(import.meta.url));
const vibyraTerminalCli = join(moduleDir, "aiTerminalOpenRouterCli.mjs");
const scriptResizeStates = new WeakMap();

const AGENT_CONFIG = {
  shell: { label: "Shell", command: "", args: [], env: [], install: "" },
  vibyra: { label: "Vibyra", command: process.execPath, args: [vibyraTerminalCli], env: ["VIBYRA_NODE"], install: "Install Node.js to run Vibyra OpenRouter terminals." },
  codex: { label: "Codex", command: "codex", args: ["--no-alt-screen"], env: ["VIBYRA_CODEX_CLI", "CODEX_CLI_PATH"], install: "Install the Codex CLI or set VIBYRA_CODEX_CLI to its executable path." },
  claude: { label: "Claude", command: "claude", args: [], env: ["VIBYRA_CLAUDE_CLI", "CLAUDE_CLI_PATH"], install: "Install Claude Code or set VIBYRA_CLAUDE_CLI to its executable path." },
  gemini: { label: "Gemini", command: "gemini", args: [], env: ["VIBYRA_GEMINI_CLI", "GEMINI_CLI_PATH"], install: "Install the Gemini CLI so `gemini` is on PATH, or set VIBYRA_GEMINI_CLI to its executable path." }
};

export function spawnAiTerminalProcess({ agent = "vibyra", model = "", reasoningEffort = "medium", permissionMode = "standard", tokenMode = "vibyra", projectId = "", terminalId = "", cwd = process.cwd(), cols = 100, rows = 30, onData, onExit }) {
  const shell = process.env.SHELL || "/bin/bash";
  const status = aiTerminalAgentStatus(agent);
  const launch = launchCommand(status, shell, { model, reasoningEffort, permissionMode });
  const env = terminalEnv({ agent: status.key, label: status.label, model, reasoningEffort, permissionMode, tokenMode, projectId, terminalId, cols, rows });
  const command = terminalSessionCommand({ status, launch, shell, cols, rows });

  if (existsSync("/usr/bin/script")) {
    return spawnWithScript({ command, cwd, env, cols, rows, onData, onExit });
  }

  const child = spawn(shell, ["-lc", command], { cwd, env, stdio: "pipe" });
  attachProcess(child, onData, onExit);
  return child;
}

export function listAiTerminalAgentStatuses() {
  return ["vibyra", "codex", "claude", "gemini", "shell"].map(aiTerminalAgentStatus);
}

export function aiTerminalAgentStatus(agent = "vibyra") {
  const key = AGENT_CONFIG[agent] ? agent : "vibyra";
  const config = AGENT_CONFIG[key];
  const commandPath = resolveAgentExecutable(config);
  return {
    key,
    label: config.label,
    available: key === "shell" || Boolean(commandPath),
    command: config.command,
    commandPath,
    args: config.args || [],
    installHint: config.install
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
  const args = aiTerminalAgentArgs(status.key, options);
  return [status.commandPath, ...args].map(shellQuote).join(" ");
}

export function aiTerminalAgentArgs(agent, options = {}) {
  const key = AGENT_CONFIG[agent] ? agent : "vibyra";
  const args = [...(AGENT_CONFIG[key].args || [])];
  if (key !== "codex") return args;
  const model = codexModelName(options.model);
  if (model && model !== "auto") args.push("--model", model);
  const effort = normalizeReasoningEffort(options.reasoningEffort);
  if (effort !== "default") args.push("-c", `model_reasoning_effort="${effort}"`);
  if (normalizePermissionMode(options.permissionMode) === "full") {
    args.push("--dangerously-bypass-approvals-and-sandbox");
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
