import { chmodSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { PORT } from "./state.mjs";
import { openAiAccountCredential } from "./providerAccounts.mjs";

export function terminalEnv({ agent, label, model, reasoningEffort, tokenMode = "vibyra", projectId, cols, rows }) {
  const commandDir = vibyraCommandDir();
  const env = {
    ...process.env,
    TERM: process.env.TERM || "xterm-256color",
    COLORTERM: process.env.COLORTERM || "truecolor",
    COLUMNS: String(cols),
    LINES: String(rows),
    PATH: `${commandDir}${delimiter}${process.env.PATH || ""}`,
    VIBYRA_DESKTOP_PORT: String(PORT),
    VIBYRA_TERMINAL_AGENT: agent,
    VIBYRA_TERMINAL_LABEL: label,
    VIBYRA_OPENROUTER_MODEL: String(model || ""),
    VIBYRA_REASONING_EFFORT: String(reasoningEffort || "medium"),
    VIBYRA_TOKEN_MODE: String(tokenMode || "vibyra"),
    VIBYRA_TERMINAL_PROJECT_ID: String(projectId || "")
  };
  const openai = tokenMode === "provider" ? openAiAccountCredential() : null;
  if (openai?.apiKey) {
    env.OPENAI_API_KEY = openai.apiKey;
    if (openai.organization) env.OPENAI_ORG_ID = openai.organization;
    if (openai.project) env.OPENAI_PROJECT = openai.project;
  }
  return env;
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
