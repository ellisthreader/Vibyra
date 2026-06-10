const LOCAL_COMMANDS = [
  "/help", "/status", "/model", "/effort", "/permissions", "/clear", "/new",
  "/resume", "/copy", "/export", "/context", "/cd", "/usage", "/stop", "/exit"
];

const WORKFLOW_COMMANDS = [
  "/plan", "/review", "/debug", "/doctor", "/diff", "/run", "/verify",
  "/fix", "/refactor", "/simplify", "/explain", "/compact"
];

const ALIASES = {
  "/?": "/help",
  "/commands": "/help",
  "/about": "/status",
  "/sandbox": "/permissions",
  "/reset": "/new",
  "/quit": "/exit"
};

const PROFILE = Object.freeze({
  key: "vibyra-agent",
  label: "Vibyra Agent",
  commands: Object.freeze([...LOCAL_COMMANDS, ...WORKFLOW_COMMANDS, ...Object.keys(ALIASES)])
});

export function terminalCommandProfile() {
  return PROFILE;
}

export function terminalCommandProvider() {
  return PROFILE.key;
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
    const command = rawCommand.toLowerCase();
    return {
      kind: "slash",
      command: ALIASES[command] || command,
      args: rest.join(" ").trim()
    };
  }
  const mentions = Array.from(
    value.matchAll(/(?:^|\s)@([\w./~-]+)/g),
    (match) => match[1]
  );
  return { kind: "prompt", prompt: value, mentions };
}

export function commandIsKnown(profile, command) {
  return command === "/" || profile.commands.includes(command);
}

export function commandIsLocal(command) {
  return LOCAL_COMMANDS.includes(command);
}

export function providerCommandHelp(profile = PROFILE) {
  return profile.commands
    .filter((command) => !Object.hasOwn(ALIASES, command))
    .map((command) => `${command.padEnd(14)} ${providerCommandHint(command)}`)
    .join("\n");
}

export function providerCommandHint(command) {
  const hints = {
    "/help": "show this shared command list",
    "/status": "show runtime, model, thread, and access",
    "/model": "show the selected model",
    "/effort": "set reasoning effort for the next task",
    "/permissions": "show Standard or Full access",
    "/clear": "clear and redraw this terminal",
    "/new": "start a new agent thread",
    "/resume": "show the persistent thread used automatically",
    "/copy": "copy the latest response",
    "/export": "export this terminal transcript",
    "/context": "show or stage a file or directory",
    "/cd": "change the working directory",
    "/usage": "show truthful billing and session information",
    "/stop": "cancel the current task when one is active",
    "/exit": "close this terminal",
    "/plan": "create a concrete implementation plan",
    "/review": "review changes with findings first",
    "/debug": "diagnose and fix from evidence",
    "/doctor": "inspect workspace and toolchain health",
    "/diff": "inspect and explain current changes",
    "/run": "run a requested workflow",
    "/verify": "run focused verification",
    "/fix": "implement the smallest correct fix",
    "/refactor": "refactor while preserving behavior",
    "/simplify": "reduce complexity without changing behavior",
    "/explain": "explain using repository evidence",
    "/compact": "summarize context for continuation"
  };
  return hints[command] || "run a Vibyra Agent workflow";
}

export function providerCommandPrompt(command, args) {
  const target = args || "the current workspace and conversation";
  const intents = {
    "/plan": "Create a concrete implementation plan. Do not edit until the plan is complete.",
    "/review": "Review current changes. Put findings first, ordered by severity, with file references.",
    "/debug": "Diagnose the reported issue from evidence, then implement and verify the smallest fix.",
    "/doctor": "Inspect the workspace and toolchain health, diagnose failures, and fix actionable issues.",
    "/diff": "Inspect and explain the current diff, including regressions and missing tests.",
    "/run": "Run the requested workflow with available tools and report the actual result.",
    "/verify": "Run focused verification for the target and report failures accurately.",
    "/fix": "Implement and verify the smallest correct fix.",
    "/refactor": "Refactor while preserving behavior, then run focused verification.",
    "/simplify": "Simplify the implementation while preserving behavior and tests.",
    "/explain": "Explain the target using concrete repository evidence.",
    "/compact": "Summarize useful conversation and workspace context for continuation."
  };
  return `${intents[command] || "Complete the requested Vibyra Agent workflow."}\n\nTarget: ${target}`;
}
