import { spawn, spawnSync } from "node:child_process";
import { accessSync, constants, existsSync, readFileSync, readlinkSync } from "node:fs";
import { delimiter, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { terminalEnv, terminalSessionCommand } from "./aiTerminalVibyraShell.mjs";

const moduleDir = dirname(fileURLToPath(import.meta.url));
const vibyraTerminalCli = join(moduleDir, "aiTerminalOpenRouterCli.mjs");

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
  const env = interactiveAiTerminalEnv(terminalEnv({
    agent: status.key,
    label: status.label,
    model,
    reasoningEffort,
    permissionMode,
    tokenMode,
    projectId,
    terminalId,
    cols,
    rows
  }));
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

export function interactiveAiTerminalEnv(source = {}) {
  const env = {
    ...source,
    TERM: source.TERM && source.TERM !== "dumb" ? source.TERM : "xterm-256color",
    COLORTERM: source.COLORTERM || "truecolor",
    FORCE_COLOR: "1"
  };
  delete env.NO_COLOR;
  return env;
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
  attachScriptResize(child);
  attachProcess(child, onData, onExit);
  return child;
}

function attachScriptResize(child) {
  let pending = null;
  let timer = null;
  let attempts = 0;
  let terminalReady = false;
  const readyTimer = setTimeout(() => {
    terminalReady = true;
    if (pending && !timer) apply();
  }, 2000);
  readyTimer.unref?.();
  const apply = () => {
    timer = null;
    if (!pending || child.exitCode !== null || child.signalCode) return;
    if (resizeScriptPty(child.pid, pending.cols, pending.rows)) {
      if (!terminalReady) {
        timer = setTimeout(apply, 25);
        timer.unref?.();
        return;
      }
      const complete = pending.complete;
      pending = null;
      complete?.(true);
      return;
    }
    if (attempts++ < 20) {
      timer = setTimeout(apply, 25);
      timer.unref?.();
      return;
    }
    const complete = pending.complete;
    pending = null;
    complete?.(false);
  };
  child.resize = (cols, rows, complete) => {
    pending?.complete?.(false);
    pending = {
      cols: Math.max(2, integer(cols, 100)),
      rows: Math.max(2, integer(rows, 30)),
      complete
    };
    attempts = 0;
    clearTimeout(timer);
    apply();
    return true;
  };
  child.markTerminalReady = () => {
    terminalReady = true;
    clearTimeout(readyTimer);
    if (pending && !timer) apply();
  };
  child.once("close", () => {
    clearTimeout(timer);
    clearTimeout(readyTimer);
    pending?.complete?.(false);
    pending = null;
  });
}

function resizeScriptPty(pid, cols, rows) {
  const pty = descendantPty(pid);
  if (!pty) return false;
  try {
    return spawnSync("stty", ["-F", pty, "rows", String(rows), "cols", String(cols)], {
      stdio: "ignore"
    }).status === 0;
  } catch {
    return false;
  }
}

function descendantPty(rootPid) {
  const queue = [rootPid];
  const seen = new Set(queue);
  while (queue.length) {
    const pid = queue.shift();
    try {
      const path = readlinkSync(`/proc/${pid}/fd/0`);
      if (path.startsWith("/dev/pts/")) return path;
    } catch {}
    let children = [];
    try {
      children = readFileSync(`/proc/${pid}/task/${pid}/children`, "utf8").trim().split(/\s+/);
    } catch {}
    for (const value of children) {
      const childPid = Number(value);
      if (childPid > 0 && !seen.has(childPid)) {
        seen.add(childPid);
        queue.push(childPid);
      }
    }
  }
  return "";
}

function attachProcess(child, onData, onExit) {
  const handleData = (chunk) => {
    child.markTerminalReady?.();
    onData?.(chunk.toString("utf8"));
  };
  child.stdout?.on("data", handleData);
  child.stderr?.on("data", handleData);
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
  args.push("-c", `model_reasoning_effort="${normalizeReasoningEffort(options.reasoningEffort)}"`);
  if (normalizePermissionMode(options.permissionMode) === "full") {
    args.push("--dangerously-bypass-approvals-and-sandbox");
  }
  return args;
}

function normalizeReasoningEffort(value) {
  const effort = String(value || "medium").toLowerCase();
  return ["low", "medium", "high", "xhigh"].includes(effort) ? effort : "medium";
}

function normalizePermissionMode(value) {
  return String(value || "").toLowerCase() === "full" ? "full" : "standard";
}

function codexModelName(value) {
  return String(value || "").trim().replace(/^openai\//i, "");
}
