async function sendTerminal(id) {
  const terminal = findTerminal(id);
  if (!terminal || terminal.pending) return;
  const text = terminal.draft.trim();
  if (!text) return;
  const profile = terminalProviderProfile(terminal);
  const parsed = parseTerminalInput(terminal, text, profile);
  if (parsed.handled) return;
  const model = (config().chatModels || []).find((item) => item.key === terminal.model);
  if (typeof modelLocked === "function" && modelLocked(model) && typeof firstUnlockedModel === "function") terminal.model = firstUnlockedModel();
  const history = terminal.messages.filter((message) => ["user", "assistant"].includes(message.role)).slice(-8).map((message) => ({ role: message.role, text: message.text }));
  const pending = makeTerminalMessage("assistant", "Thinking...", { provider: profile.key });
  const before = Array.isArray(parsed.messagesBefore) ? parsed.messagesBefore : [];
  terminal.messages.push(...before, makeTerminalMessage("user", text, { provider: profile.key }), pending);
  terminal.draft = "";
  terminal.pending = true;
  terminal.notice = null;
  terminal.updatedAt = Date.now();
  forceTerminalRender = true;
  saveTerminals();
  render();
  try {
    const result = await requestDesktopChat({ history, model: terminal.model, mode: "chat", profileContext: typeof desktopProfileContext === "function" ? desktopProfileContext() : null, projectId: terminal.projectId, prompt: parsed.backendPrompt || text, reasoningEffort: terminal.effort, skill: "", tool: "", attachments: [] });
    pending.text = result.reply || "I received an empty response from Vibyra AI.";
    if (result.title && /^Terminal \d+$/i.test(terminal.title)) terminal.title = String(result.title).slice(0, 72);
  } catch (error) {
    pending.text = error instanceof Error ? error.message : "Vibyra AI terminal failed. Try again.";
    if (isUsageLimit(error)) terminal.notice = pending.text;
  } finally {
    terminal.pending = false;
    terminal.updatedAt = Date.now();
    forceTerminalRender = true;
    saveTerminals();
    render();
  }
}

function parseTerminalInput(terminal, text, profile = terminalProviderProfile(terminal)) {
  if (profile.key === "gemini" && terminal.shellMode && text !== "!") return handleShellCommand(terminal, text, profile, true);
  if (text.startsWith("/")) return handleSlashCommand(terminal, text, profile);
  if (text.startsWith("!")) return handleShellCommand(terminal, text, profile, false);
  const mention = terminalMentionFromText(text);
  if (mention) return { handled: false, backendPrompt: text + "\n\n[" + profile.mentionLabel + ": " + mention + "]", messagesBefore: [makeTerminalMessage("system", mention, { type: "mention", provider: profile.key, meta: { path: mention } })] };
  return { handled: false, backendPrompt: text, messagesBefore: [] };
}

function terminalCommandOptions(terminal, draftOverride = null) {
  const profile = terminalProviderProfile(terminal);
  const draft = String(draftOverride ?? terminal?.draft ?? "");
  if (!/^\/[\w?-]*$/.test(draft)) return [];
  const query = draft.toLowerCase();
  const commands = profile.commands.filter((command) => command.startsWith(query)).slice(0, 12);
  const options = commands.map((command) => ({ command, hint: terminalCommandHint(command, profile) }));
  if (!options.length) terminalCommandIndexes[terminal.id] = 0;
  else terminalCommandIndexes[terminal.id] = Math.min(Math.max(terminalCommandIndexes[terminal.id] || 0, 0), options.length - 1);
  return options;
}

function handleSlashCommand(terminal, text, profile) {
  const trimmed = text.trim();
  const parts = trimmed.split(/\s+/);
  const command = String(parts.shift() || "").toLowerCase();
  const args = parts.join(" ").trim();
  if (command === "/") { appendTerminalMessages(terminal, [makeTerminalMessage("system", terminalHelpText(profile), { type: "help", provider: profile.key, meta: { command: "/" } })], { clearDraft: true }); return { handled: true }; }
  if (!profile.commands.includes(command)) { appendTerminalMessages(terminal, [makeTerminalMessage("system", "Unknown " + profile.commandPrefix + ": " + command + ". Use /help to see available commands.", { provider: profile.key, meta: { command, args } })], { clearDraft: true }); return { handled: true }; }
  const local = handleLocalSlashCommand(terminal, command, args, profile);
  if (local) return local;
  const prompt = terminalCommandBackendPrompt(command, args, profile);
  return {
    handled: false,
    backendPrompt: prompt,
    messagesBefore: [makeTerminalMessage("system", profile.label + " command " + command + (args ? " " + args : ""), { type: terminalCommandMessageType(command), provider: profile.key, meta: { command, args } })]
  };
}

function handleLocalSlashCommand(terminal, command, args, profile) {
  if (command === "/clear") { terminal.messages = []; terminal.draft = ""; terminal.shellMode = false; terminal.updatedAt = Date.now(); terminalCommandIndexes[terminal.id] = 0; forceTerminalRender = true; saveTerminals(); render(); return { handled: true }; }
  if (["/new", "/resume", "/chat", "/fork", "/side"].includes(command)) { createTerminal(terminal.model, true); return { handled: true }; }
  if (["/exit", "/quit"].includes(command)) { closeTerminal(terminal.id); return { handled: true }; }
  if (["/rename", "/title"].includes(command)) return renameTerminalCommand(terminal, args, profile, command);
  if (command === "/model") return modelTerminalCommand(terminal, args, profile, command);
  if (command === "/effort") return effortTerminalCommand(terminal, args, profile, command);
  if (command === "/fast") return setTerminalEffortCommand(terminal, "low", profile, command);
  if (["/help", "/?", "/commands"].includes(command)) { appendTerminalMessages(terminal, [makeTerminalMessage("system", terminalHelpText(profile), { type: "help", provider: profile.key, meta: { command } })], { clearDraft: true }); return { handled: true }; }
  if (["/shells", "/bashes"].includes(command)) { appendTerminalMessages(terminal, [makeTerminalMessage("system", terminalShellHelpText(profile), { type: "help", provider: profile.key, meta: { command } })], { clearDraft: true }); return { handled: true }; }
  if (command === "/copy") { writeTerminalClipboard(terminalTranscript(terminal)); appendTerminalMessages(terminal, [makeTerminalMessage("system", "Transcript copied to clipboard.", { type: "tool", provider: profile.key, meta: { command } })], { clearDraft: true }); return { handled: true }; }
  if (command === "/export") { exportTerminalTranscript(terminal, profile); appendTerminalMessages(terminal, [makeTerminalMessage("system", "Transcript exported as a local text file.", { type: "tool", provider: profile.key, meta: { command } })], { clearDraft: true }); return { handled: true }; }
  if (["/status", "/about"].includes(command)) { appendTerminalMessages(terminal, [makeTerminalMessage("system", terminalStatusText(terminal, profile, command), { type: "tool", provider: profile.key, meta: { command } })], { clearDraft: true }); return { handled: true }; }
  if (["/usage", "/cost", "/stats"].includes(command)) { appendTerminalMessages(terminal, [makeTerminalMessage("system", terminalUsageText(terminal, profile), { type: "tool", provider: profile.key, meta: { command } })], { clearDraft: true }); return { handled: true }; }
  if (["/permissions", "/sandbox", "/approve"].includes(command)) { appendTerminalMessages(terminal, [makeTerminalMessage("system", terminalPermissionText(command), { type: "approval", provider: profile.key, meta: { command } })], { clearDraft: true }); return { handled: true }; }
  if (["/theme", "/keymap", "/vim", "/settings", "/statusline", "/personality", "/experimental", "/debug-config"].includes(command)) { appendTerminalMessages(terminal, [makeTerminalMessage("system", terminalSettingText(command, args, profile), { type: "tool", provider: profile.key, meta: { command, args } })], { clearDraft: true }); return { handled: true }; }
  if (["/directory", "/add-dir", "/context", "/mention"].includes(command)) { appendTerminalMessages(terminal, [makeTerminalMessage("system", terminalContextCommandText(command, args, terminal, profile), { type: args ? "mention" : "tool", provider: profile.key, meta: { command, args, path: args } })], { clearDraft: true }); return { handled: true }; }
  if (["/auth", "/logout"].includes(command)) { appendTerminalMessages(terminal, [makeTerminalMessage("system", "Provider auth is managed by your Vibyra Desktop account session. Use the account avatar to switch accounts or sign out.", { type: "tool", provider: profile.key, meta: { command } })], { clearDraft: true }); return { handled: true }; }
  if (command === "/upgrade") { if (typeof openTokenModal === "function") openTokenModal("plans"); appendTerminalMessages(terminal, [makeTerminalMessage("system", "Opened Vibyra plan controls.", { type: "tool", provider: profile.key, meta: { command } })], { clearDraft: true }); return { handled: true }; }
  if (["/privacy", "/docs"].includes(command)) { appendTerminalMessages(terminal, [makeTerminalMessage("system", command === "/privacy" ? "Privacy controls are in the account and support surfaces." : "Documentation is available from the account Help surface. This terminal keeps provider command help in /help.", { type: "tool", provider: profile.key, meta: { command } })], { clearDraft: true }); return { handled: true }; }
  if (["/bug", "/feedback"].includes(command)) { openTerminalFeedback(command, args); appendTerminalMessages(terminal, [makeTerminalMessage("system", "Opened feedback mail composer.", { type: "tool", provider: profile.key, meta: { command, args } })], { clearDraft: true }); return { handled: true }; }
  if (["/mcp", "/ide", "/extensions", "/hooks", "/plugin", "/plugins", "/reload-plugins", "/skills", "/apps", "/agent", "/agents", "/tasks", "/background", "/ps", "/tools", "/init", "/memory", "/memories", "/terminal-setup", "/setup-github"].includes(command)) { appendTerminalMessages(terminal, [makeTerminalMessage("system", terminalIntegrationText(command, profile), { type: "tool", provider: profile.key, meta: { command } })], { clearDraft: true }); return { handled: true }; }
  if (command === "/stop") { appendTerminalMessages(terminal, [makeTerminalMessage("system", "No running response in this terminal.", { provider: profile.key, meta: { command } })], { clearDraft: true }); return { handled: true }; }
  return null;
}

function renameTerminalCommand(terminal, args, profile, command) {
  if (!args) { appendTerminalMessages(terminal, [makeTerminalMessage("system", "Usage: " + command + " <terminal name>", { provider: profile.key, meta: { command } })], { clearDraft: true }); return { handled: true }; }
  terminal.title = args.slice(0, 72);
  appendTerminalMessages(terminal, [makeTerminalMessage("system", profile.label + " renamed this terminal to " + terminal.title + ".", { provider: profile.key, meta: { command, args } })], { clearDraft: true });
  return { handled: true };
}

function modelTerminalCommand(terminal, args, profile, command) {
  if (!args) { settingsTerminalId = terminal.id; appendTerminalMessages(terminal, [makeTerminalMessage("system", profile.label + " model controls opened.", { type: "tool", provider: profile.key, meta: { command } })], { clearDraft: true }); return { handled: true }; }
  const query = args.toLowerCase();
  const model = (config().chatModels || []).find((item) => [item.key, item.label, item.provider].some((value) => String(value || "").toLowerCase().includes(query)));
  if (!model) { appendTerminalMessages(terminal, [makeTerminalMessage("system", "No model matched " + args + ". Open /model with no argument to pick one.", { provider: profile.key, meta: { command, args } })], { clearDraft: true }); return { handled: true }; }
  if (typeof modelLocked === "function" && modelLocked(model)) { if (typeof openTokenModal === "function") openTokenModal("plans"); appendTerminalMessages(terminal, [makeTerminalMessage("system", model.label + " requires a plan upgrade.", { provider: profile.key, meta: { command, args } })], { clearDraft: true }); return { handled: true }; }
  terminal.model = model.key;
  appendTerminalMessages(terminal, [makeTerminalMessage("system", "Model changed to " + model.label + ".", { type: "tool", provider: profile.key, meta: { command, args } })], { clearDraft: true });
  return { handled: true };
}

function effortTerminalCommand(terminal, args, profile, command) {
  if (!args) { appendTerminalMessages(terminal, [makeTerminalMessage("system", "Available effort values: " + (config().chatEfforts || []).map((effort) => effort.value).join(", ") + ". Usage: /effort <value>", { type: "help", provider: profile.key, meta: { command } })], { clearDraft: true }); return { handled: true }; }
  return setTerminalEffortCommand(terminal, args.toLowerCase(), profile, command);
}

function setTerminalEffortCommand(terminal, next, profile, command) {
  const effort = (config().chatEfforts || []).find((item) => item.value === next);
  if (!effort) { appendTerminalMessages(terminal, [makeTerminalMessage("system", "Unknown effort " + next + ". Available: " + (config().chatEfforts || []).map((item) => item.value).join(", ") + ".", { provider: profile.key, meta: { command, args: next } })], { clearDraft: true }); return { handled: true }; }
  terminal.effort = effort.value;
  appendTerminalMessages(terminal, [makeTerminalMessage("system", profile.label + " effort set to " + effort.value + ".", { type: "tool", provider: profile.key, meta: { command, args: next } })], { clearDraft: true });
  return { handled: true };
}

function handleShellCommand(terminal, text, profile, fromShellMode) {
  const command = fromShellMode ? text.trim() : text.slice(1).trim();
  if (profile.key === "gemini" && text.trim() === "!") { terminal.shellMode = !terminal.shellMode; appendTerminalMessages(terminal, [makeTerminalMessage("system", "Shell mode " + (terminal.shellMode ? "enabled" : "disabled") + ".", { provider: profile.key, meta: { command: "!", status: terminal.shellMode ? "running" : "done" } })], { clearDraft: true }); return { handled: true }; }
  if (!command) { appendTerminalMessages(terminal, [makeTerminalMessage("system", profile.label + " shell syntax expects a command after !.", { provider: profile.key, meta: { command: "!" } })], { clearDraft: true }); return { handled: true }; }
  runTerminalShellCommand(terminal, command, profile);
  return { handled: true };
}

async function runTerminalShellCommand(terminal, command, profile) {
  const row = makeTerminalMessage("system", command, { type: "shell", provider: profile.key, meta: { command, args: "Running allowed desktop command...", status: "running" } });
  appendTerminalMessages(terminal, [row], { clearDraft: true });
  try {
    const response = await fetch("/commands/run", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ projectId: terminal.projectId, command }) });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result.error) throw new Error(result.error || result.message || "Command failed.");
    row.meta.args = result.output || "Command finished with no output.";
    row.meta.status = result.ok ? "done" : "failed";
    row.meta.exitCode = result.ok ? 0 : 1;
  } catch (error) {
    row.meta.args = error instanceof Error ? error.message : "Command failed.";
    row.meta.status = "failed";
    row.meta.exitCode = 1;
  } finally {
    terminal.pending = false;
    terminal.updatedAt = Date.now();
    forceTerminalRender = true;
    saveTerminals();
    render();
  }
}

function appendTerminalMessages(terminal, messages, options = {}) { terminal.messages.push(...messages.filter(Boolean)); if (options.clearDraft) terminal.draft = ""; terminal.updatedAt = Date.now(); terminalCommandIndexes[terminal.id] = 0; forceTerminalRender = true; saveTerminals(); render(); }
function terminalMentionFromText(text) { const match = String(text || "").match(/(?:^|\s)@([\w./~-]+)/); return match ? match[1] : ""; }
function terminalHelpText(profile) { return profile.commands.map((command) => command + " " + terminalCommandHint(command, profile)).join("\n"); }
function terminalShellHelpText(profile) { return "Use !<command> to run an allowed desktop command in the selected project. Allowed commands: git status, npm install, npm run dev, npm run build, npm test, pytest." + (profile.key === "gemini" ? "\nA lone ! toggles persistent Gemini shell mode." : ""); }
