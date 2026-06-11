const CATEGORY_DEFINITIONS = [
  ["terminal", "Terminal", "Local terminal state and controls."],
  ["workspace", "Workspace", "Agent workflows for repository context and discovery."],
  ["git", "Git", "Agent workflows for changes, history, and checkpoints."],
  ["delivery", "Delivery", "Agent workflows that implement and validate work."],
  ["quality", "Quality", "Agent workflows for review, diagnosis, and improvement."]
];

const COMMAND_DEFINITIONS = [
  local("/help", "terminal", "Show this shared command catalog.", "/help", ["/?", "/commands"]),
  local("/status", "terminal", "Show runtime, model, thread, and access.", "/status", ["/about", "/version", "/session"]),
  local("/identity", "terminal", "Show Vibyra Agent and selected-model identity.", "/identity", ["/whoami"]),
  local("/model", "terminal", "Show the selected model.", "/model"),
  local("/effort", "terminal", "Set reasoning effort for the next task.", "/effort <default|low|medium|high|xhigh>", [], argument("level", true)),
  local("/permissions", "terminal", "Show Standard or Full access.", "/permissions", ["/sandbox"]),
  local("/clear", "terminal", "Clear and redraw this terminal.", "/clear"),
  local("/new", "terminal", "Start a new agent thread.", "/new", ["/reset"]),
  local("/resume", "terminal", "Show the persistent thread used automatically.", "/resume", ["/thread"]),
  local("/copy", "terminal", "Copy the latest response.", "/copy"),
  local("/export", "terminal", "Export this terminal transcript.", "/export"),
  local("/context", "terminal", "Show or stage a file or directory.", "/context [path]", ["/cwd"], argument("path")),
  local("/unstage", "terminal", "Remove staged context without changing Git.", "/unstage <path|all>", [], argument("path|all", true)),
  local("/pwd", "terminal", "Show the current working directory.", "/pwd"),
  local("/cd", "terminal", "Change the working directory.", "/cd <path>", [], argument("path", true)),
  local("/files", "terminal", "List files at a workspace path.", "/files [path]", ["/ls"], argument("path")),
  local("/git", "terminal", "Show concise Git workspace status.", "/git"),
  local("/history", "terminal", "Show recent terminal prompt history.", "/history [count]", [], argument("count")),
  local("/usage", "terminal", "Show truthful billing and session information.", "/usage", ["/billing"]),
  local("/shell", "terminal", "Show direct shell syntax and access rules.", "/shell"),
  local("/stop", "terminal", "Cancel the current task when one is active.", "/stop", ["/cancel"]),
  local("/exit", "terminal", "Close this terminal.", "/exit", ["/quit"]),

  workflow("/init", "workspace", "Establish repository instructions and working context.",
    "Inspect the repository instructions, structure, and current state. Establish concise working context before making changes."),
  workflow("/inspect", "workspace", "Inspect a target using repository evidence.",
    "Inspect the target using available repository tools. Report concrete evidence and do not edit unless the target explicitly requests changes."),
  workflow("/search", "workspace", "Search the workspace and explain the evidence.",
    "Search the workspace for the target and explain the concrete evidence with file references."),
  workflow("/explain", "workspace", "Explain a target from repository evidence.",
    "Explain the target using concrete repository evidence."),
  workflow("/compact", "workspace", "Summarize context for continuation.",
    "Summarize useful conversation and workspace context for continuation."),

  workflow("/diff", "git", "Inspect and explain current changes.",
    "Inspect and explain the current diff, including regressions and missing tests.", ["/changes"]),
  workflow("/checkpoint", "git", "Summarize current progress and verification.",
    "Create an evidence-based work checkpoint: summarize current changes, repository status, verification completed, failures, and remaining risks. Do not create a Git commit unless explicitly requested."),

  workflow("/plan", "delivery", "Create a concrete implementation plan.",
    "Create a concrete implementation plan. Do not edit until the plan is complete."),
  workflow("/run", "delivery", "Run a requested workflow.",
    "Run the requested workflow with available tools and report the actual result."),
  workflow("/fix", "delivery", "Implement the smallest correct fix.",
    "Implement and verify the smallest correct fix."),
  workflow("/test", "delivery", "Run focused tests and diagnose failures.",
    "Run the narrowest useful tests for the target. Diagnose failures and fix regressions when appropriate.", ["/tests"]),
  workflow("/build", "delivery", "Run the relevant build and diagnose failures.",
    "Run the relevant build for the target. Diagnose and fix actionable build failures."),
  workflow("/verify", "delivery", "Run focused verification.",
    "Run focused verification for the target and report failures accurately.", ["/check"]),

  workflow("/review", "quality", "Review changes with findings first.",
    "Review current changes. Put findings first, ordered by severity, with file references.", ["/audit"]),
  workflow("/debug", "quality", "Diagnose and fix from evidence.",
    "Diagnose the reported issue from evidence, then implement and verify the smallest fix.", ["/diagnose"]),
  workflow("/doctor", "quality", "Inspect workspace and toolchain health.",
    "Inspect the workspace and toolchain health, diagnose failures, and fix actionable issues."),
  workflow("/refactor", "quality", "Refactor while preserving behavior.",
    "Refactor while preserving behavior, then run focused verification."),
  workflow("/simplify", "quality", "Reduce complexity without changing behavior.",
    "Simplify the implementation while preserving behavior and tests."),
  workflow("/security-review", "quality", "Review security risks and remediations.",
    "Perform a security-focused review. Put findings first with severity, evidence, and concrete remediation.")
];

const COMMANDS_BY_NAME = Object.freeze(Object.fromEntries(
  COMMAND_DEFINITIONS.map((command) => [command.name, command])
));
const LOCAL_COMMAND_NAMES = Object.freeze(
  COMMAND_DEFINITIONS.filter((command) => command.kind === "local").map((command) => command.name)
);
const ALIASES = Object.freeze(Object.fromEntries(
  COMMAND_DEFINITIONS.flatMap((command) => command.aliases.map((alias) => [alias, command.name]))
));
const CATEGORIES = Object.freeze(CATEGORY_DEFINITIONS.map(([key, label, description]) => Object.freeze({
  key,
  label,
  description,
  commands: Object.freeze(COMMAND_DEFINITIONS.filter((command) => command.category === key).map((command) => command.name))
})));
const PROFILE = Object.freeze({
  key: "vibyra-agent",
  label: "Vibyra Agent",
  commands: Object.freeze([...Object.keys(COMMANDS_BY_NAME), ...Object.keys(ALIASES)]),
  localCommands: LOCAL_COMMAND_NAMES,
  categories: CATEGORIES,
  commandMetadata: COMMANDS_BY_NAME
});

export function terminalCommandProfile() {
  return PROFILE;
}

export function terminalCommandProvider() {
  return PROFILE.key;
}

export function terminalCommandCategories(profile = PROFILE) {
  return profile.categories || CATEGORIES;
}

export function terminalLocalCommands(profile = PROFILE) {
  return profile.localCommands || LOCAL_COMMAND_NAMES;
}

export function terminalCommandMetadata(command, profile = PROFILE) {
  const name = canonicalCommand(command);
  return profile.commandMetadata?.[name] || COMMANDS_BY_NAME[name] || null;
}

export function parseProviderInput(text) {
  const value = String(text || "").trim();
  if (!value) return { kind: "empty" };
  if (value === "!") return { kind: "shell", command: "", shellMode: false };
  if (value.startsWith("!")) {
    return { kind: "shell", command: value.slice(1).trim(), shellMode: false };
  }
  if (value.startsWith("/")) {
    const [rawCommand, ...rest] = value.split(/\s+/);
    return {
      kind: "slash",
      command: canonicalCommand(rawCommand),
      args: rest.join(" ").trim()
    };
  }
  const mentions = Array.from(value.matchAll(/(?:^|\s)@([\w./~-]+)/g), (match) => match[1]);
  return { kind: "prompt", prompt: value, mentions };
}

export function commandIsKnown(profile, command) {
  return command === "/" || Boolean(terminalCommandMetadata(command, profile));
}

export function commandIsLocal(command) {
  return terminalCommandMetadata(command)?.kind === "local";
}

export function commandIsWorkflow(command) {
  return terminalCommandMetadata(command)?.kind === "agent-workflow";
}

export function providerCommandHelp(profile = PROFILE) {
  return terminalCommandCategories(profile)
    .map((category) => {
      const commands = category.commands
        .map((command) => `${command.padEnd(16)} ${providerCommandHint(command)}`)
        .join("\n");
      return `${category.label}\n${commands}`;
    })
    .join("\n\n");
}

export function providerCommandHint(command) {
  return terminalCommandMetadata(command)?.summary || "Run a Vibyra Agent workflow.";
}

export function providerCommandUsage(command) {
  return terminalCommandMetadata(command)?.usage || canonicalCommand(command);
}

export function providerCommandPrompt(command, args) {
  const metadata = terminalCommandMetadata(command);
  const target = String(args || "").trim() || "the current workspace and conversation";
  const intent = metadata?.workflowPrompt || "Complete the requested Vibyra Agent workflow.";
  return `${intent}\n\nTarget: ${target}`;
}

function local(name, category, summary, usage, aliases = [], argumentMetadata = null) {
  return command({
    name,
    category,
    summary,
    usage,
    aliases,
    kind: "local",
    argumentMetadata,
    dispatch: name.slice(1)
  });
}

function workflow(name, category, summary, workflowPrompt, aliases = []) {
  return command({
    name,
    category,
    summary,
    usage: `${name} [target]`,
    aliases,
    kind: "agent-workflow",
    argumentMetadata: argument("target"),
    dispatch: "",
    workflowPrompt
  });
}

function command({ name, category, summary, usage, aliases, kind, argumentMetadata, dispatch, workflowPrompt = "" }) {
  return Object.freeze({
    name,
    kind,
    category,
    summary,
    usage,
    aliases: Object.freeze([...aliases]),
    argument: argumentMetadata,
    dispatch,
    workflowPrompt
  });
}

function argument(name, required = false) {
  return Object.freeze({ name, required });
}

function canonicalCommand(command) {
  const name = String(command || "").trim().toLowerCase();
  return ALIASES[name] || name;
}
