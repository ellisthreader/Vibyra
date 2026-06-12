const storageKey = "vibyra.desktop.aiTerminals";
const activeKey = "vibyra.desktop.activeTerminal";
const layoutKey = "vibyra.desktop.terminalsLayout";
const maxTerminals = 12;
let terminals = [];
let activeTerminalId = "";
let terminalLayout = localStorage.getItem(layoutKey) === "grid" ? "grid" : "focus";
let newTerminalMenuOpen = false;
let terminalToolbarMenuOpen = false;
let newTerminalModelSearch = "";
let settingsTerminalId = "";
let forceTerminalRender = false;
let setupCount = 1;
const setupModelKey = "vibyra.desktop.terminalSetupModel";
let setupModel = localStorage.getItem(setupModelKey) || "auto";
const setupEffortKey = "vibyra.desktop.terminalSetupEffort";
const storedSetupEffort = localStorage.getItem(setupEffortKey) || localStorage.getItem("vibyra.desktop.reasoningEffort") || "medium";
let setupEffort = ["default", "low", "medium", "high", "xhigh"].includes(storedSetupEffort) ? storedSetupEffort : "medium";
const setupProjectKey = "vibyra.desktop.terminalProject";
let setupProjectId = localStorage.getItem(setupProjectKey) || (typeof selectedProjectId === "string" ? selectedProjectId : "");
const setupWorkspaceModeKey = "vibyra.desktop.terminalWorkspaceMode";
const storedSetupWorkspaceMode = localStorage.getItem(setupWorkspaceModeKey);
let setupWorkspaceMode = storedSetupWorkspaceMode === null
  ? "worktree"
  : storedSetupWorkspaceMode === "worktree" ? "worktree" : "shared";
const setupPermissionModeKey = "vibyra.desktop.terminalPermissionMode";
let setupPermissionMode = localStorage.getItem(setupPermissionModeKey) === "full" ? "full" : "standard";
const storedTerminalTokenMode = localStorage.getItem("vibyra.desktop.terminalTokenMode");
let setupTokenMode = ["vibyra", "provider"].includes(storedTerminalTokenMode)
  ? storedTerminalTokenMode
  : "vibyra";
let setupModelMenuOpen = false;
let setupModelSearch = "";
let providerAccounts = {
  codex: { provider: "codex", available: false, connected: false, source: "", label: "ChatGPT" },
  claude: { provider: "claude", available: false, connected: false, source: "", label: "Claude Code" },
  gemini: { provider: "gemini", available: false, connected: false, source: "", label: "Gemini CLI" }
};
let providerConnectNotice = "";
const modelScrollTops = { new: 0, setup: 0 };
const terminalCommandIndexes = {};
const terminalMessageTypes = new Set(["text", "tool", "shell", "diff", "todo", "approval", "review", "mention", "help"]);
const terminalProfiles = {
  claude: {
    key: "claude",
    label: "Claude Code",
    accent: "#ff9b6a",
    promptToken: "❯",
    historyPromptToken: ">",
    assistantToken: "⏺",
    shellOutputToken: "⎿",
    placeholder: "Try \"edit AppContext.tsx to...\"",
    shellPlaceholder: "Run a shell command",
    bannerTitle: "Claude Code",
    version: "2.1.145",
    unsupportedCopy: "Command recognized but not available in Vibyra Desktop yet",
    commandPrefix: "Claude Code command",
    mentionLabel: "Claude file mention",
    planPrefix: "Plan this change in Claude Code style before editing files.",
    reviewPrefix: "Review this change in Claude Code style. Put risks and concrete file references first.",
    commands: ["/clear", "/phone", "/voice", "/compact", "/resume", "/branch", "/exit", "/quit", "/rename", "/add-dir", "/memory", "/context", "/init", "/model", "/effort", "/fast", "/plan", "/permissions", "/sandbox", "/tui", "/theme", "/mcp", "/agents", "/tasks", "/background", "/hooks", "/ide", "/plugin", "/reload-plugins", "/diff", "/review", "/security-review", "/simplify", "/run", "/verify", "/batch", "/debug", "/doctor", "/help", "/copy", "/usage", "/cost", "/stats", "/feedback", "/export", "/terminal-setup"]
  },
  openai: {
    key: "openai",
    label: "OpenAI Codex",
    accent: "#8b5cff",
    promptToken: "›",
    historyPromptToken: "›",
    assistantToken: "•",
    shellOutputToken: "$",
    placeholder: "Ask Codex to plan, edit, review, or run a command",
    shellPlaceholder: "Propose a shell command",
    bannerTitle: ">_ OpenAI Codex",
    version: "0.132.0",
    unsupportedCopy: "Codex command recognized but not available in Vibyra Desktop yet",
    commandPrefix: "Codex command",
    mentionLabel: "Codex fuzzy file mention",
    planPrefix: "Make a concise Codex implementation plan. Explain actions, risks, and verification before editing.",
    reviewPrefix: "Review this like Codex CLI. Findings first, ordered by severity, with file references when possible.",
    commands: ["/clear", "/phone", "/voice", "/new", "/resume", "/fork", "/side", "/exit", "/quit", "/raw", "/copy", "/model", "/fast", "/personality", "/plan", "/goal", "/permissions", "/approve", "/status", "/mention", "/ide", "/review", "/diff", "/compact", "/skills", "/agent", "/apps", "/plugins", "/hooks", "/init", "/mcp", "/logout", "/feedback", "/experimental", "/debug-config", "/statusline", "/title", "/theme", "/keymap", "/memory", "/memories", "/ps", "/stop", "/help"]
  },
  gemini: {
    key: "gemini",
    label: "Gemini CLI",
    accent: "#6aa8ff",
    promptToken: ">",
    historyPromptToken: ">",
    shellPromptToken: "!",
    yoloPromptToken: "*",
    assistantToken: "✦",
    idleToken: "✦",
    idleText: "Awaiting your next command or request.",
    placeholder: "Type your message or @path/to/file",
    shellPlaceholder: "Shell mode",
    bannerTitle: "Gemini CLI",
    version: "0.42.0",
    unsupportedCopy: "Gemini command recognized but not available in Vibyra Desktop yet",
    commandPrefix: "Gemini command",
    mentionLabel: "Gemini @ path context",
    planPrefix: "Use Gemini CLI planning mode for this request. Be specific and list next actions.",
    reviewPrefix: "Review this in Gemini CLI style. List findings, context, and suggested commands.",
    commands: ["/about", "/phone", "/voice", "/auth", "/chat", "/resume", "/clear", "/compress", "/copy", "/quit", "/exit", "/restore", "/rewind", "/directory", "/init", "/memory", "/model", "/plan", "/permissions", "/theme", "/vim", "/settings", "/tools", "/mcp", "/ide", "/extensions", "/hooks", "/commands", "/skills", "/agents", "/stats", "/privacy", "/upgrade", "/docs", "/bug", "/shells", "/bashes", "/help", "/?", "/editor", "/terminal-setup", "/setup-github"]
  },
  auto: {
    key: "auto",
    label: "Vibyra Desktop",
    accent: "#b9a7f6",
    promptToken: ">",
    historyPromptToken: ">",
    assistantToken: "vibyra",
    shellOutputToken: "$",
    placeholder: "Type a prompt...",
    shellPlaceholder: "Propose a shell command",
    bannerTitle: "Vibyra Desktop",
    version: "2.1.0",
    unsupportedCopy: "Command recognized but not available in Auto routing yet",
    commandPrefix: "Vibyra command",
    mentionLabel: "Vibyra context mention",
    planPrefix: "Make a concise implementation plan for this request.",
    reviewPrefix: "Review this change. Findings first, with concrete file references when possible.",
    commands: ["/open", "/phone", "/voice", "/memory", "/new", "/clear", "/help", "/plan", "/debug", "/review", "/explain", "/fix", "/refactor", "/model"]
  }
};
