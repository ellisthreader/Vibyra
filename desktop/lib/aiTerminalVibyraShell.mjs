import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { PORT } from "./state.mjs";
import { openAiAccountCredential } from "./providerAccounts.mjs";

export function terminalEnv({ agent, label, model, reasoningEffort, permissionMode = "standard", tokenMode = "vibyra", projectId, terminalId = "", cols, rows }) {
  const commandDir = vibyraCommandDir();
  const env = {
    ...process.env,
    TERM: process.env.TERM || "xterm-256color",
    COLORTERM: process.env.COLORTERM || "truecolor",
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
    VIBYRA_TOKEN_MODE: String(tokenMode || "vibyra"),
    VIBYRA_TERMINAL_PROJECT_ID: String(projectId || ""),
    VIBYRA_TERMINAL_ID: String(terminalId || "")
  };
  if (agent === "codex") env.CODEX_HOME = embeddedCodexHome(terminalId);
  const openai = tokenMode === "provider" ? openAiAccountCredential() : null;
  if (openai?.apiKey) {
    env.OPENAI_API_KEY = openai.apiKey;
    if (openai.organization) env.OPENAI_ORG_ID = openai.organization;
    if (openai.project) env.OPENAI_PROJECT = openai.project;
  }
  return env;
}

function embeddedCodexHome(terminalId) {
  const root = String(process.env.VIBYRA_CODEX_HOME_ROOT || "").trim()
    || join(homedir(), ".vibyra-agent", "codex-terminals");
  const dir = join(root, safePathPart(terminalId || `codex-${process.pid}`));
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  try { chmodSync(root, 0o700); } catch {}
  try { chmodSync(dir, 0o700); } catch {}
  seedCodexHome(dir);
  return dir;
}

function seedCodexHome(targetDir) {
  const sourceDir = String(process.env.CODEX_HOME || "").trim() || join(homedir(), ".codex");
  if (!existsSync(sourceDir) || sourceDir === targetDir) return;
  for (const name of ["auth.json", "config.toml", "requirements.toml", "skills", "plugins"]) {
    const source = join(sourceDir, name);
    const target = join(targetDir, name);
    if (!existsSync(source) || existsSync(target)) continue;
    try {
      cpSync(source, target, { recursive: true, errorOnExist: false });
      if (name === "auth.json") chmodSync(target, 0o600);
    } catch {}
  }
}

export function terminalSessionCommand({ status, launch, shell, cols, rows }) {
  const prelude = `stty rows ${integer(rows, 30)} cols ${integer(cols, 100)} 2>/dev/null || true`;
  const fallback = [
    "stty sane echo icanon isig opost onlcr 2>/dev/null || true",
    `printf '\\r\\n${shellEscapeForDouble(status.label)} exited. Project shell ready. Type \"vibyra help\" for commands.\\r\\n'`,
    `exec ${shellQuote(shell)} -i`
  ].join("\n");
  const shellOnly = `${prelude}\nstty sane echo icanon isig opost onlcr 2>/dev/null || true\nexec ${shellQuote(shell)} -i`;
  const inner = status.commandPath ? `${prelude}\n${launch}\ncode=$?\n${fallback}` : shellOnly;
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

function shellEscapeForDouble(value) {
  return String(value).replace(/[$`"\\]/g, "\\$&");
}

function integer(value, fallback) {
  const numeric = Number.parseInt(String(value || ""), 10);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function safePathPart(value) {
  return String(value || "terminal").replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 120) || "terminal";
}
