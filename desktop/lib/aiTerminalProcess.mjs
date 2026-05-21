import { spawn } from "node:child_process";
import { accessSync, constants, existsSync } from "node:fs";
import { delimiter } from "node:path";

const AGENT_CONFIG = {
  shell: { label: "Shell", command: "", args: [], env: [], install: "" },
  codex: { label: "Codex", command: "codex", args: ["--no-alt-screen"], env: ["VIBYRA_CODEX_CLI", "CODEX_CLI_PATH"], install: "Install the Codex CLI or set VIBYRA_CODEX_CLI to its executable path." },
  claude: { label: "Claude", command: "claude", args: [], env: ["VIBYRA_CLAUDE_CLI", "CLAUDE_CLI_PATH"], install: "Install Claude Code or set VIBYRA_CLAUDE_CLI to its executable path." },
  gemini: { label: "Gemini", command: "gemini", args: [], env: ["VIBYRA_GEMINI_CLI", "GEMINI_CLI_PATH"], install: "Install the Gemini CLI so `gemini` is on PATH, or set VIBYRA_GEMINI_CLI to its executable path." }
};

export function spawnAiTerminalProcess({ agent = "codex", cwd = process.cwd(), cols = 100, rows = 30, onData, onExit }) {
  const shell = process.env.SHELL || "/bin/bash";
  const status = aiTerminalAgentStatus(agent);
  const launch = launchCommand(status, shell);
  const env = { ...process.env, TERM: process.env.TERM || "xterm-256color", COLORTERM: process.env.COLORTERM || "truecolor", COLUMNS: String(cols), LINES: String(rows) };

  if (existsSync("/usr/bin/script")) {
    return spawnWithScript({ command: launch, cwd, env, cols, rows, onData, onExit });
  }

  const child = status.commandPath
    ? spawn(status.commandPath, status.args || [], { cwd, env, stdio: "pipe" })
    : spawn(shell, ["-l"], { cwd, env, stdio: "pipe" });
  attachProcess(child, onData, onExit);
  return child;
}

export function listAiTerminalAgentStatuses() {
  return ["codex", "claude", "gemini", "shell"].map(aiTerminalAgentStatus);
}

export function aiTerminalAgentStatus(agent = "codex") {
  const key = AGENT_CONFIG[agent] ? agent : "codex";
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
  const ptyCommand = `stty rows ${integer(rows, 30)} cols ${integer(cols, 100)}; exec ${command}`;
  const child = spawn("/usr/bin/script", ["-qf", "-e", "-E", "never", "-c", ptyCommand, "/dev/null"], { cwd, env, stdio: "pipe" });
  attachProcess(child, onData, onExit);
  return child;
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

function launchCommand(status, shell) {
  if (!status.commandPath) return `${shellQuote(shell)} -l`;
  const args = Array.isArray(status.args) ? status.args : [];
  return [status.commandPath, ...args].map(shellQuote).join(" ");
}
