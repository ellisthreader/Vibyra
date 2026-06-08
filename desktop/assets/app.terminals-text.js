function terminalCommandHint(command, profile) {
  if (command === "/clear") return "clear this terminal transcript";
  if (["/new", "/resume", "/chat", "/fork", "/side"].includes(command)) return "open another terminal session";
  if (["/exit", "/quit"].includes(command)) return "close this terminal";
  if (["/rename", "/title"].includes(command)) return "rename this terminal";
  if (command === "/model") return "change or search models";
  if (command === "/effort") return "set reasoning effort";
  if (command === "/fast") return "switch to low effort";
  if (["/help", "/?", "/commands"].includes(command)) return "show provider commands";
  if (command === "/phone") return "show the phone preview panel";
  if (["/copy", "/export"].includes(command)) return "copy or save the transcript";
  if (["/status", "/about"].includes(command)) return "show terminal and provider status";
  if (["/usage", "/cost", "/stats"].includes(command)) return "show local usage/account summary";
  if (["/permissions", "/sandbox", "/approve"].includes(command)) return "inspect desktop permissions";
  if (["/plan", "/goal"].includes(command)) return "ask the model to plan";
  if (["/review", "/security-review"].includes(command)) return "ask the model to review";
  if (["/debug", "/doctor"].includes(command)) return "ask the model to diagnose";
  if (["/fix", "/refactor", "/simplify", "/explain", "/run", "/verify", "/batch", "/compact", "/compress", "/diff", "/raw", "/open"].includes(command)) return "send a provider-scoped AI command";
  if (["/directory", "/add-dir", "/context", "/mention"].includes(command)) return "manage staged path context";
  if (["/shells", "/bashes"].includes(command)) return "show shell command help";
  if (["/theme", "/keymap", "/vim", "/settings", "/statusline", "/personality"].includes(command)) return "show local terminal setting";
  if (["/auth", "/logout", "/upgrade", "/privacy", "/docs", "/bug", "/feedback"].includes(command)) return "open account, help, or feedback flow";
  if (["/mcp", "/ide", "/extensions", "/hooks", "/plugin", "/plugins", "/reload-plugins", "/skills", "/apps", "/agent", "/agents", "/tasks", "/background", "/ps", "/tools", "/init", "/memory", "/memories", "/terminal-setup", "/setup-github"].includes(command)) return "show integration status";
  if (command === "/stop") return "stop or inspect running work";
  return "run this " + profile.label + " command";
}

function terminalCommandBackendPrompt(command, args, profile) {
  const target = args || "the current project context";
  const base = terminalCommandIntent(command, profile);
  if (command === "/raw" && args) return args;
  return base + "\n\nCommand: " + command + "\nTarget: " + target;
}

function terminalCommandIntent(command, profile) {
  if (command === "/plan" || command === "/goal") return profile.planPrefix;
  if (command === "/review") return profile.reviewPrefix;
  if (command === "/security-review") return "Perform a security-focused review. Findings first, with severity and concrete remediation.";
  if (command === "/debug" || command === "/doctor") return "Diagnose the issue like " + profile.label + ". Identify likely causes, checks to run, and the smallest fix.";
  if (command === "/fix") return "Propose and explain the smallest correct fix for this request.";
  if (command === "/refactor") return "Refactor this request carefully. Preserve behavior and explain verification.";
  if (command === "/simplify") return "Simplify the implementation while preserving behavior. Call out tradeoffs.";
  if (command === "/explain") return "Explain the relevant code or behavior clearly and concretely.";
  if (command === "/run") return "Plan the command or workflow to run, explain expected output, and note any approval-sensitive steps.";
  if (command === "/verify") return "Create a verification plan and identify focused tests or checks.";
  if (command === "/batch") return "Break this into a safe batch of ordered implementation tasks.";
  if (command === "/compact" || command === "/compress") return "Compact the current terminal context into a concise continuation summary.";
  if (command === "/diff") return "Review or summarize the current diff/change request. If no diff is available, ask for the missing context.";
  if (command === "/open") return "Open or inspect the requested file/path conceptually using available project context.";
  if (command === "/raw") return "Respond directly to the raw prompt without extra terminal command framing.";
  return "Run this " + profile.label + " command realistically inside Vibyra Desktop. Explain what can be done from the available project context and perform the useful AI-side work now.";
}

function terminalCommandMessageType(command) {
  if (["/review", "/security-review"].includes(command)) return "review";
  if (["/run", "/verify", "/diff"].includes(command)) return "tool";
  return "system";
}

function terminalStatusText(terminal, profile, command) {
  const model = modelByKey(terminal.model);
  const project = projectForTerminal(terminal);
  const cwd = terminal.cwd || project?.path || "Default workspace";
  return (command === "/about" ? profile.label + " v" + profile.version : profile.label + " status") + "\nmodel: " + model.label + "\neffort: " + terminal.effort + "\nproject: " + (project?.name || "No project selected") + "\ndirectory: " + cwd + "\nlayout: " + terminalLayout + "\nmessages: " + terminal.messages.length + "\nshell mode: " + (terminal.shellMode ? "on" : "off");
}

function terminalUsageText(terminal, profile) {
  const account = typeof currentAccount === "function" ? currentAccount() : {};
  const tier = typeof currentPlanTier === "function" ? currentPlanTier() : null;
  const monthlyUsed = Number(account.monthlyCreditsUsed ?? account.creditsUsed ?? 0);
  const monthlyCap = Number(account.monthlyCreditsCap ?? account.creditsCap ?? 0);
  const plan = tier?.name || account.plan || "Free";
  return profile.label + " usage\nplan: Vibyra " + plan + "\nmonthly credits: " + monthlyUsed + (monthlyCap ? " / " + monthlyCap : "") + "\nterminal messages: " + terminal.messages.length + "\nlocal cost tracking: provider billing is handled by Vibyra account services";
}

function terminalPermissionText(command) {
  if (command === "/approve") return "approval mode: ask-before-edit\nchat: allowed\nfile edits: approval required\nshell: allowlisted commands only";
  if (command === "/sandbox") return "sandbox: workspace context\nnetwork: Vibyra AI session\nshell: restricted\nwrite access: approval required";
  return "permission mode: default\nchat: allowed\nproject context: selected workspace only\nshell: allowlisted\nfile edits: ask first";
}

function terminalSettingText(command, args, profile) {
  const key = "vibyra.desktop.terminal.setting." + profile.key + "." + command.slice(1);
  if (args) localStorage.setItem(key, args);
  const value = localStorage.getItem(key) || (command === "/theme" ? "Vibyra dark" : command === "/keymap" ? "default" : "off");
  return command.slice(1) + ": " + value + (args ? "" : "\nUsage: " + command + " <value> to store a local preference.");
}

function terminalContextCommandText(command, args, terminal, profile) {
  const project = projectForTerminal(terminal);
  if (args) return profile.mentionLabel + " staged: " + args;
  return "Current project context: " + (project?.name || "No project selected") + ". Use " + command + " <path> to stage a path mention in this terminal.";
}

function terminalIntegrationText(command, profile) {
  const labels = { "/mcp": "MCP servers", "/ide": "IDE integration", "/extensions": "Extensions", "/hooks": "Hooks", "/plugin": "Plugins", "/plugins": "Plugins", "/reload-plugins": "Plugins", "/skills": "Skills", "/apps": "Apps", "/agent": "Agents", "/agents": "Agents", "/tasks": "Tasks", "/background": "Background tasks", "/ps": "Processes", "/tools": "Tools", "/init": "Project init", "/memory": "Memory", "/memories": "Memory", "/terminal-setup": "Terminal setup", "/setup-github": "GitHub setup" };
  return (labels[command] || command) + " are surfaced through Vibyra Desktop and " + profile.label + " command routing. No additional local setup is required in this terminal session.";
}

function terminalTranscript(terminal) {
  return terminal.messages.map((message) => { const item = normalizeTerminalMessage(message); return (item.role || "system") + ": " + item.text; }).join("\n\n");
}

function writeTerminalClipboard(text) { try { navigator.clipboard?.writeText?.(text); } catch {} }
function exportTerminalTranscript(terminal, profile) {
  try {
    const blob = new Blob([terminalTranscript(terminal)], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = (profile.key + "-terminal-" + new Date().toISOString().slice(0, 10) + ".txt").replace(/[^a-z0-9_.-]/gi, "-");
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch {}
}

function openTerminalFeedback(command, args) {
  const subject = command === "/bug" ? "Vibyra Desktop terminal bug" : "Vibyra Desktop terminal feedback";
  const body = args || "";
  try { window.open("mailto:support@vibyra.app?subject=" + encodeURIComponent(subject) + "&body=" + encodeURIComponent(body), "_blank"); } catch {}
}
