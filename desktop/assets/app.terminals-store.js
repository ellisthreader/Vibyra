function config() {
  return window.vibyraDesktopChatConfig || { chatModels: [], chatModelGroups: [], chatEfforts: [], chatSkills: [] };
}

function loadTerminals() {
  try {
    const parsed = JSON.parse(localStorage.getItem(storageKey) || "[]");
    const loaded = Array.isArray(parsed) ? parsed.map(normalizeTerminal).filter(Boolean).slice(0, maxTerminals) : [];
    return typeof repairTerminalTeamIds === "function" ? repairTerminalTeamIds(loaded) : loaded;
  } catch {
    return [];
  }
}

function normalizeTerminal(item) {
  if (!item || typeof item !== "object") return null;
  return {
    id: String(item.id || "").trim() || terminalId(),
    title: String(item.title || "Terminal").slice(0, 72),
    model: String(item.model || "auto"),
    effort: normalizeTerminalEffort(item.effort),
    permissionMode: normalizeTerminalPermissionMode(item.permissionMode),
    tokenMode: ["vibyra", "provider"].includes(String(item.tokenMode || ""))
      ? String(item.tokenMode)
      : "vibyra",
    projectId: String(item.projectId || ""),
    workspaceMode: normalizeTerminalWorkspaceMode(item.workspaceMode),
    allowSharedFallback: item.allowSharedFallback !== false,
    branchName: String(item.branchName || ""),
    workspacePath: String(item.workspacePath || ""),
    workspaceNotice: String(item.workspaceNotice || ""),
    teamId: String(item.teamId || ""),
    teamSize: Math.max(0, Math.min(4, Number(item.teamSize) || 0)),
    teamGoal: String(item.teamGoal || "").slice(0, 1200),
    teamRole: String(item.teamRole || "").slice(0, 40),
    teamRoleKey: String(item.teamRoleKey || "").slice(0, 40),
    teamPhase: String(item.teamPhase || "").slice(0, 40),
    teamCapability: String(item.teamCapability || "").slice(0, 40),
    teamRoleContractVersion: Math.max(0, Number(item.teamRoleContractVersion) || 0),
    teamRolePolicyHash: String(item.teamRolePolicyHash || "").slice(0, 128),
    teamTask: String(item.teamTask || "").slice(0, 500),
    teamPlanId: String(item.teamPlanId || "").slice(0, 120),
    teamPlannerMode: String(item.teamPlannerMode || "").slice(0, 40),
    teamPlannerModel: String(item.teamPlannerModel || "").slice(0, 120),
    teamPlannerFallbackReason: String(item.teamPlannerFallbackReason || "").slice(0, 80),
    draft: String(item.draft || ""),
    shellMode: Boolean(item.shellMode),
    profileVersion: 1,
    pending: false,
    notice: null,
    updatedAt: Number(item.updatedAt) || Date.now(),
    messages: Array.isArray(item.messages) ? item.messages.map(normalizeTerminalMessage).filter(Boolean).slice(-60) : []
  };
}

function normalizeTerminalMessage(message) {
  if (!message || typeof message !== "object") return null;
  const role = ["user", "assistant", "system"].includes(message.role) ? message.role : "assistant";
  const type = terminalMessageTypes.has(message.type) ? message.type : "text";
  const provider = ["claude", "openai", "gemini", "auto"].includes(message.provider) ? message.provider : "";
  const meta = message.meta && typeof message.meta === "object" ? {
    command: String(message.meta.command || "").slice(0, 240),
    args: String(message.meta.args || "").slice(0, 2000),
    status: String(message.meta.status || ""),
    path: String(message.meta.path || "").slice(0, 500),
    exitCode: Number.isFinite(Number(message.meta.exitCode)) ? Number(message.meta.exitCode) : null
  } : {};
  return { role, type, text: String(message.text ?? message.content ?? "").slice(0, 16000), provider, meta, profileVersion: 1 };
}

function makeTerminalMessage(role, text, options = {}) {
  return normalizeTerminalMessage({ role, text, type: options.type || "text", provider: options.provider || "", meta: options.meta || {} });
}

function terminalId() {
  return `terminal-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function normalizeTerminalEffort(value) {
  const effort = String(value || "medium").toLowerCase();
  return ["default", "low", "medium", "high", "xhigh"].includes(effort) ? effort : "medium";
}

function normalizeTerminalPermissionMode(value) {
  return String(value || "").toLowerCase() === "full" ? "full" : "standard";
}

function normalizeTerminalWorkspaceMode(value) {
  return ["worktree", "isolated"].includes(String(value || "").toLowerCase()) ? "worktree" : "shared";
}

function saveTerminals() {
  localStorage.setItem(storageKey, JSON.stringify(terminals.map(({ pending, notice, ...terminal }) => terminal).slice(0, maxTerminals)));
  if (activeTerminalId) localStorage.setItem(activeKey, activeTerminalId);
  else localStorage.removeItem(activeKey);
  localStorage.setItem(layoutKey, terminalLayout);
  localStorage.setItem(setupWorkspaceModeKey, setupWorkspaceMode);
  localStorage.setItem("vibyra.desktop.terminalTokenMode", setupTokenMode);
}

function ensureTerminal() {
  if (!terminals.length) {
    activeTerminalId = "";
    return;
  }
  if (!terminals.some((terminal) => terminal.id === activeTerminalId)) activeTerminalId = terminals[0]?.id || "";
  if (typeof rememberActiveTerminalForProject === "function") {
    rememberActiveTerminalForProject(terminals.find((terminal) => terminal.id === activeTerminalId));
  }
}

function createTerminal(modelKey = setupModel, shouldRender = true, options = {}) {
  if (terminals.length >= maxTerminals) return null;
  const model = unlockedModel(modelKey);
  const effort = terminalEffortForModel(model, options.effort);
  const terminal = {
    id: terminalId(),
    title: typeof terminalRandomName === "function" ? terminalRandomName() : `Terminal ${terminals.length + 1}`,
    model: model.key,
    effort,
    permissionMode: normalizeTerminalPermissionMode(options.permissionMode),
    tokenMode: setupTokenMode,
    projectId: options.projectId === undefined ? (typeof selectedProjectId === "string" ? selectedProjectId : "") : String(options.projectId || ""),
    workspaceMode: normalizeTerminalWorkspaceMode(options.workspaceMode),
    allowSharedFallback: options.allowSharedFallback !== false,
    branchName: "",
    workspacePath: "",
    workspaceNotice: "",
    teamId: String(options.teamId || ""),
    teamSize: Math.max(0, Math.min(4, Number(options.teamSize) || 0)),
    teamGoal: String(options.teamGoal || "").slice(0, 1200),
    teamRole: String(options.teamRole || "").slice(0, 40),
    teamRoleKey: String(options.teamRoleKey || "").slice(0, 40),
    teamPhase: String(options.teamPhase || "").slice(0, 40),
    teamCapability: String(options.teamCapability || "").slice(0, 40),
    teamRoleContractVersion: Math.max(0, Number(options.teamRoleContractVersion) || 0),
    teamRolePolicyHash: String(options.teamRolePolicyHash || "").slice(0, 128),
    teamTask: String(options.teamTask || "").slice(0, 500),
    draft: "",
    shellMode: false,
    profileVersion: 1,
    pending: false,
    notice: null,
    updatedAt: Date.now(),
    messages: []
  };
  terminals.unshift(terminal);
  activeTerminalId = terminal.id;
  newTerminalMenuOpen = false;
  setupModelMenuOpen = false;
  settingsTerminalId = "";
  saveTerminals();
  if (shouldRender) { forceTerminalRender = true; render(); }
  return terminal;
}

function createTerminals(count = 1, modelKey = setupModel, options = {}) {
  const total = Math.min(maxTerminals - terminals.length, normalizeCount(count));
  for (let index = 0; index < total; index += 1) createTerminal(modelKey, false, options);
  forceTerminalRender = true;
  render();
}

function terminalTopbarSubtitle() {
  ensureTerminal();
  const running = terminals.filter((terminal) => terminal.pending).length;
  return `${terminals.length}/${maxTerminals}${running ? ` running ${running}` : ""}`;
}

function terminalTopbarHtml() {
  if (!terminals.length) {
    return typeof terminalCompanionStandaloneToolbarHtml === "function"
      ? terminalCompanionStandaloneToolbarHtml()
      : "";
  }
  return terminalTabs();
}
