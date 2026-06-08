const terminalPtySockets = {};
const terminalPtyRenderTimers = {};
const terminalPtyReconnectTimers = {};
const terminalPtyReconnectAttempts = {};
const terminalXterms = {};
const terminalXtermSizes = {};
const terminalXtermSnapshots = {};
const terminalXtermReplayWrites = {};
let ptyRenderedSignature = "";
let terminalSetupAdvancedOpen = false;
const terminalPtyRendererVersion = 2;
const terminalAgents = [
  { key: "vibyra", label: "Vibyra", detail: "OpenRouter terminal", profile: "auto" },
  { key: "codex", label: "Codex", detail: "OpenAI Codex CLI", profile: "openai" },
  { key: "claude", label: "Claude", detail: "Claude Code CLI", profile: "claude" },
  { key: "gemini", label: "Gemini", detail: "Gemini CLI", profile: "gemini" },
  { key: "shell", label: "Shell", detail: "Login shell", profile: "auto" }
];
let setupAgent = localStorage.getItem("vibyra.desktop.terminalAgent") || "vibyra";

function agentForModel(model) {
  const modelKey = String(model?.modelKey || model?.key || "").trim();
  if (modelKey.includes("/")) return "vibyra";
  const provider = typeof terminalProviderKeyForModel === "function"
    ? terminalProviderKeyForModel(model)
    : String(model?.provider || "").toLowerCase();
  if (provider === "openai") return "codex";
  if (provider === "claude") return "claude";
  if (provider === "gemini") return "gemini";
  return "vibyra";
}

function normalizePtyAgentForModel(item, terminal) {
  const reportedAgent = String(item.agent || "").trim().toLowerCase();
  if (terminalAgents.some((agent) => agent.key === reportedAgent)) return reportedAgent;
  const agent = normalizeTerminalAgent(terminal.agent);
  const modelKey = String(item.model || terminal.model || "").trim();
  if (modelKey && modelKey !== "auto") return agentForModel(terminalModelForDisplay(modelKey));
  return agent;
}

const previousNormalizeTerminal = normalizeTerminal;
normalizeTerminal = function normalizePtyTerminal(item) {
  const terminal = previousNormalizeTerminal(item);
  if (!terminal) return null;
  terminal.agent = normalizePtyAgentForModel(item, terminal);
  terminal.agentStatus = item.agentStatus || null;
  terminal.tokenMode = String(item.tokenMode || terminal.tokenMode || "vibyra") === "provider" ? "provider" : "vibyra";
  terminal.permissionMode = normalizeTerminalPermissionMode(item.permissionMode || terminal.permissionMode);
  terminal.workspaceMode = normalizeTerminalWorkspaceMode(item.workspaceMode || terminal.workspaceMode);
  terminal.branchName = String(item.branchName || terminal.branchName || "");
  terminal.workspacePath = String(item.workspacePath || terminal.workspacePath || "");
  terminal.workspaceNotice = String(item.workspaceNotice || terminal.workspaceNotice || "");
  const rendererVersion = Number(item.ptyRendererVersion || 0);
  const currentRenderer = rendererVersion === terminalPtyRendererVersion;
  terminal.ptyRendererVersion = terminalPtyRendererVersion;
  terminal.cwd = String(item.cwd || "");
  terminal.output = currentRenderer ? String(item.output || "").slice(-60000) : "";
  terminal.ptyStatus = currentRenderer ? String(item.ptyStatus || item.status || "idle") : "exited";
  terminal.exitCode = Number.isFinite(Number(item.exitCode)) ? Number(item.exitCode) : null;
  return terminal;
};

saveTerminals = function savePtyTerminals() {
  const stored = terminals.map(({ initialPrompt, initialAssignmentId, pending, notice, ptyStartQueued, restoringFromSnapshot, taskActivity, ...terminal }) => ({ ...terminal, ptyRendererVersion: terminalPtyRendererVersion, output: String(terminal.output || "").slice(-60000) })).slice(0, maxTerminals);
  localStorage.setItem(storageKey, JSON.stringify(stored));
  if (activeTerminalId) localStorage.setItem(activeKey, activeTerminalId);
  else localStorage.removeItem(activeKey);
  localStorage.setItem(layoutKey, terminalLayout);
  localStorage.setItem("vibyra.desktop.terminalAgent", setupAgent);
  if (setupProjectId) localStorage.setItem(setupProjectKey, setupProjectId);
  else localStorage.removeItem(setupProjectKey);
  localStorage.setItem(setupWorkspaceModeKey, setupWorkspaceMode);
  localStorage.setItem("vibyra.desktop.terminalTokenMode", setupTokenMode);
};

terminalProviderProfile = function terminalPtyProviderProfile(terminal) {
  const provider = terminalProviderKeyForModel(terminal?.model);
  if (provider === "claude") return terminalProfiles.claude;
  if (provider === "openai") return terminalProfiles.openai;
  if (provider === "gemini") return terminalProfiles.gemini;
  return terminalProfiles.auto;
};

modelMetaChip = function terminalAgentMetaChip(terminal) {
  const model = terminalModelForDisplay(terminal.model);
  const projectLabel = terminalProjectLabel(terminal.projectId);
  const projectChip = terminal.projectId ? `<span class="terminal-meta-chip terminal-project-chip">${icon("folder")}${escapeHtml(projectLabel)}</span>` : "";
  const workspaceChip = typeof terminalWorkspaceIndicator === "function" ? terminalWorkspaceIndicator(terminal) : "";
  const permissionChip = terminal.permissionMode === "full" ? `<span class="terminal-meta-chip terminal-permission-chip">${icon("lock")}Full access</span>` : "";
  return `<span class="terminal-meta-chip terminal-model-chip">${modelLogo(model)}${escapeHtml(model.label)}</span>${projectChip}${workspaceChip}${permissionChip}`;
};

createTerminal = function createPtyTerminal(modelKey = setupModel, shouldRender = true, options = {}) {
  if (terminals.length >= maxTerminals) return null;
  const model = unlockedModel(modelKey);
  const agent = agentForModel(model);
  const effort = terminalEffortForModel(model, options.effort);
  const requestedTokenMode = ["provider", "vibyra"].includes(options.tokenMode)
    ? options.tokenMode
    : setupTokenMode;
  const tokenMode = typeof terminalTokenModeForModel === "function"
    ? terminalTokenModeForModel(model, requestedTokenMode)
    : requestedTokenMode;
  const terminal = {
    id: terminalId(),
    title: `${model.label} ${terminals.length + 1}`,
    agent,
    agentStatus: null,
    model: model.key,
    effort,
    permissionMode: normalizeTerminalPermissionMode(options.permissionMode),
    tokenMode,
    projectId: options.projectId === undefined ? terminalProjectForSetup() : String(options.projectId || ""),
    workspaceMode: normalizeTerminalWorkspaceMode(options.workspaceMode),
    allowSharedFallback: options.allowSharedFallback !== false,
    branchName: "",
    workspacePath: "",
    workspaceNotice: "",
    draft: "",
    shellMode: false,
    profileVersion: 1,
    ptyRendererVersion: terminalPtyRendererVersion,
    pending: true,
    notice: null,
    cwd: "",
    output: "",
    ptyStatus: "starting",
    providerState: "starting",
    providerReady: false,
    providerBusy: false,
    exitCode: null,
    initialPrompt: normalizeInitialTerminalPrompt(options.initialPrompt),
    updatedAt: Date.now(),
    messages: []
  };
  terminals.push(terminal);
  activeTerminalId = terminal.id;
  newTerminalMenuOpen = false;
  setupModelMenuOpen = false;
  terminalProjectMenuTarget = "";
  settingsTerminalId = "";
  saveTerminals();
  if (shouldRender) { forceTerminalRender = true; render(); }
  queueStartPtyTerminal(terminal);
  return terminal;
};

function normalizeInitialTerminalPrompt(value) {
  return String(value || "")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .trim()
    .slice(0, 8000);
}

createTerminals = function createPtyTerminals(count = 1, modelKey = setupModel, options = {}) {
  const total = Math.min(maxTerminals - terminals.length, normalizeCount(count));
  const model = unlockedModel(modelKey);
  for (let index = 0; index < total; index += 1) createTerminal(model.key, false, options);
  forceTerminalRender = true;
  render();
};

setupView = function ptySetupView() {
  const model = selectedSetupModel();
  const projectReady = typeof terminalProjectReadyForSetup !== "function" || terminalProjectReadyForSetup();
  const advanced = `${terminalSetupEffortPicker(model)}${terminalTokenSourcePanel(model, setupTokenMode, "setup")}`;
  return `<section class="terminal-setup"><div class="terminal-setup-panel">
    <div class="terminal-setup-copy"><span class="terminal-setup-icon">${icon("terminal")}</span><h2>Start AI terminals</h2></div>
    <div class="terminal-setup-block"><p>Terminals</p><div class="terminal-count-row">
      ${[1, 2, 3, 4, 6, 12].map((count) => `<button class="${setupCount === count ? "active" : ""}" type="button" data-terminal-count="${count}">${count}</button>`).join("")}
      <label class="terminal-custom-count"><input type="number" min="1" max="${maxTerminals}" value="${setupCount}" data-terminal-custom-count aria-label="Custom terminal count" /><span>Custom</span></label>
    </div></div>
    <div class="terminal-setup-grid">
      <div class="terminal-setup-block"><p>Project</p>${terminalProjectSelect("setup")}</div>
      <div class="terminal-setup-block"><p>Model</p><div class="terminal-model-select-wrap">${terminalModelSelectButton("setup", model)}${setupModelMenuOpen ? terminalModelMenu("setup", model.key) : ""}</div></div>
    </div>
    ${terminalWorkspaceSetupPicker()}
    ${advanced ? `<details class="terminal-setup-advanced" data-terminal-setup-advanced ${terminalSetupAdvancedOpen ? "open" : ""}><summary>${icon("tool")}<span>Advanced settings</span>${icon("chevron")}</summary><div>${advanced}</div></details>` : ""}
    <button class="primary-button terminal-start-button" type="button" id="start-terminals" ${projectReady ? "" : "disabled"}>${icon("plus")}${projectReady ? `Open ${setupCount} terminal${setupCount === 1 ? "" : "s"}` : "Loading project..."}</button>
  </div></section>`;
};

function terminalWorkspaceSetupPicker() {
  if (setupCount < 2 || !setupProjectId || setupProjectId === "full-pc") return "";
  const choice = (mode, title, detail, recommended = false) => `<button class="${setupWorkspaceMode === mode ? "active" : ""} ${recommended ? "recommended" : ""}" type="button" role="radio" aria-checked="${setupWorkspaceMode === mode}" data-terminal-workspace-mode="${mode}"><span class="terminal-workspace-choice-title"><strong>${title}</strong>${recommended ? "<em>Recommended</em>" : ""}</span><small>${detail}</small></button>`;
  return `<div class="terminal-setup-block"><p>Workspace safety</p><div class="terminal-workspace-row" role="radiogroup" aria-label="Terminal workspace safety">${choice("worktree", "Safe mode", "Each terminal gets separate files to prevent overlap", true)}${choice("shared", "Shared folder", "Advanced: terminals can edit the same files")}</div></div>`;
}

newTerminalMenu = function ptyNewTerminalMenu() {
  return terminalModelMenu("new", selectedSetupModel().key);
};

activeTerminalView = function ptyActiveTerminalView(terminal) {
  const active = terminal.id === activeTerminalId;
  const hiddenClass = active ? "active" : "terminal-focus-hidden";
  const hiddenAttr = active ? "" : " aria-hidden=\"true\"";
  return `<article class="terminal-focus ${terminalProviderClass(terminal)} ${hiddenClass} ${terminal.notice ? "has-notice" : ""}" data-terminal="${escapeAttribute(terminal.id)}"${hiddenAttr}><header class="terminal-focus-head"><div class="terminal-name">${terminalStatusDot(terminal)}<strong>${escapeHtml(terminal.title)}</strong></div><div class="terminal-meta">${modelMetaChip(terminal)}<button class="terminal-settings-button" type="button" data-terminal-settings="${escapeAttribute(terminal.id)}" aria-label="Terminal settings" title="Terminal settings">${icon("menu")}</button>${settingsTerminalId === terminal.id ? settingsMenu(terminal) : ""}</div></header>${terminal.notice ? terminalNotice(terminal) : ""}${terminalViewport(terminal)}</article>`;
};

terminalFocusViews = function ptyTerminalFocusViews() {
  return terminals.map(activeTerminalView).join("");
};

terminalTile = function ptyTerminalTile(terminal) {
  const active = terminal.id === activeTerminalId;
  const position = Math.max(1, terminals.findIndex((item) => item.id === terminal.id) + 1);
  const workspaceChip = typeof terminalWorkspaceIndicator === "function" ? terminalWorkspaceIndicator(terminal) : "";
  return `<article class="terminal-tile ${terminalProviderClass(terminal)} ${active ? "active" : ""}" data-terminal="${escapeAttribute(terminal.id)}"><header class="terminal-tile-head"><button type="button" data-terminal-focus="${escapeAttribute(terminal.id)}"><span class="terminal-grid-number">${position}</span>${terminalStatusDot(terminal)}<strong>${escapeHtml(terminal.title)}</strong></button>${workspaceChip}<button class="terminal-settings-button" type="button" data-terminal-settings="${escapeAttribute(terminal.id)}" aria-label="Terminal settings">${icon("menu")}</button>${settingsTerminalId === terminal.id ? settingsMenu(terminal) : ""}</header>${terminalViewport(terminal)}</article>`;
};

function terminalViewport(terminal) {
  const unavailable = terminal.ptyStatus === "unavailable";
  return `<div class="terminal-lines terminal-pty-lines ${unavailable ? "terminal-pty-unavailable" : ""}" tabindex="0" role="region" aria-label="${escapeAttribute(`${terminal.title || "Terminal"} output`)}" data-terminal-input="${escapeAttribute(terminal.id)}">${unavailable ? `<pre>${escapeHtml(terminal.output || "")}</pre>` : `<div class="terminal-xterm" data-terminal-xterm="${escapeAttribute(terminal.id)}"></div>`}</div>`;
}

terminalComposer = function ptyTerminalComposer(terminal) {
  return "";
};

settingsMenu = function ptySettingsMenu(terminal) {
  const project = projectForTerminal(terminal);
  const optionRow = (iconName, label, value, detail = "", className = "") => `<div class="terminal-option-row ${className}">${icon(iconName)}<span class="terminal-option-copy"><small>${label}</small><strong>${escapeHtml(value)}</strong>${detail ? `<em>${escapeHtml(detail)}</em>` : ""}</span></div>`;
  const projectRow = optionRow("folder", "Project", project?.name || (terminal.projectId ? "Selected project" : "No project selected"), "", "terminal-project-row");
  const workspace = typeof terminalWorkspaceDisplay === "function" ? terminalWorkspaceDisplay(terminal) : null;
  const workspaceRow = workspace ? optionRow(workspace.key === "isolated" || workspace.key === "preparing" ? "split" : "folder", "Workspace", workspace.label, workspace.detail, "terminal-branch-row") : "";
  const fullAccess = terminal.permissionMode === "full";
  const permissionRow = optionRow(fullAccess ? "lock" : "shield", "Access", fullAccess ? "Full access" : "Standard", fullAccess ? "Approvals and sandbox are disabled" : "Approvals and sandbox stay enabled", fullAccess ? "terminal-permission-row" : "");
  const cwd = terminal.cwd ? optionRow("terminal", "Path", terminal.cwd, "", "terminal-path-row") : "";
  const advanced = `${cwd}${terminalTokenSourcePanel(terminalModelForDisplay(terminal.model), terminal.tokenMode, terminal.id)}`;
  const rename = `<form class="terminal-rename-form" data-terminal-rename-form="${escapeAttribute(terminal.id)}"><label for="terminal-name-${escapeAttribute(terminal.id)}">Terminal name</label><div><input id="terminal-name-${escapeAttribute(terminal.id)}" type="text" maxlength="72" value="${escapeAttribute(terminal.title)}" data-terminal-rename-input autocomplete="off" /><button type="submit">Rename</button></div><small data-terminal-rename-status aria-live="polite"></small></form>`;
  return `<div class="terminal-menu terminal-settings-menu" role="dialog" aria-label="Terminal options">${rename}<div class="terminal-menu-section">${projectRow}${workspaceRow}${permissionRow}</div><div class="terminal-menu-section terminal-menu-advanced"><p class="terminal-menu-section-label">Advanced</p>${advanced}</div><button class="terminal-close-row" type="button" data-terminal-close="${escapeAttribute(terminal.id)}">${icon("trash")}<span>Close terminal</span></button></div>`;
};

terminalTopbarSubtitle = function ptyTerminalTopbarSubtitle() {
  ensureTerminal();
  const running = terminals.filter((terminal) => terminal.ptyStatus === "running" || terminal.pending).length;
  return `${terminals.length}/${maxTerminals}${running ? ` running ${running}` : ""}`;
};

function terminalTabAgentLabel(terminal, index) {
  const key = normalizeTerminalAgent(terminal?.agent);
  const agent = terminalAgents.find((item) => item.key === key);
  return `${agent?.label || "Vibyra"} ${index + 1}`;
}

terminalTabs = function ptyTerminalTabs() {
  const tabs = terminals.map((terminal, index) => {
    const active = terminal.id === activeTerminalId;
    const label = terminalTabAgentLabel(terminal, index);
    return `<div class="terminal-tab ${active ? "active" : ""}" draggable="true" data-terminal-drag="${escapeAttribute(terminal.id)}" title="${escapeAttribute(`${label}: ${terminal.title}`)}"><button class="terminal-tab-open" type="button" role="tab" aria-selected="${active}" data-terminal-focus="${escapeAttribute(terminal.id)}" aria-label="Open ${escapeAttribute(label)}">${terminalStatusDot(terminal)}<span>${escapeHtml(label)}</span></button><button class="terminal-tab-close" type="button" data-terminal-close="${escapeAttribute(terminal.id)}" aria-label="Close ${escapeAttribute(label)}">${icon("close")}</button></div>`;
  }).join("");
  const companionTools = typeof terminalCompanionToolbarHtml === "function" ? terminalCompanionToolbarHtml() : "";
  const menu = terminalToolbarMenuOpen ? `<div class="terminal-menu terminal-toolbar-menu" role="menu">
    <button type="button" id="toggle-terminal-layout">${icon(terminalLayout === "grid" ? "terminal" : "grid")}<span>${terminalLayout === "grid" ? "Focus view" : "Grid view"}</span></button>
    <button class="danger" type="button" data-terminal-close-all>${icon("trash")}<span>Close all terminals</span></button>
  </div>` : "";
  return `<header class="terminal-tabs"><div class="terminal-new-wrap"><button class="terminal-add" id="open-terminal-new" type="button" aria-label="New terminal" title="New terminal" ${terminals.length >= maxTerminals ? "disabled" : ""}>${icon("plus")}</button>${newTerminalMenuOpen ? newTerminalMenu() : ""}</div><div class="terminal-tab-list" role="tablist" aria-label="AI terminals">${tabs}</div>${companionTools}<div class="terminal-toolbar-wrap"><button class="terminal-layout-button" id="open-terminal-toolbar" type="button" aria-haspopup="menu" aria-expanded="${terminalToolbarMenuOpen ? "true" : "false"}" aria-label="Terminal options" title="Terminal options">${icon("menu")}</button>${menu}</div></header>`;
};

function terminalStatusState(terminal) {
  if (terminal.providerState === "fallback-shell") {
    return String(terminal.agent || "").toLowerCase() === "shell"
      ? { key: "idle", label: "Project shell" }
      : { key: "stopped", label: "AI provider exited; shell remains open" };
  }
  if (terminal.providerState === "unavailable" || terminal.providerState === "error") return { key: "unavailable", label: "AI provider unavailable" };
  if (terminal.providerState === "starting" || terminal.providerReady === false) return { key: "running", label: "AI provider starting" };
  if (terminal.providerState === "busy" || terminal.providerBusy) return { key: "running", label: "AI provider busy" };
  if (terminal.pending || terminal.ptyStatus === "starting" || terminal.ptyStatus === "running") return { key: "running", label: "Running" };
  if (terminal.ptyStatus === "unavailable") return { key: "unavailable", label: "Unavailable" };
  if (terminal.ptyStatus === "exited" && Number(terminal.exitCode) === 0) return { key: "success", label: "Completed" };
  if (terminal.ptyStatus === "exited" && terminal.exitCode !== null && terminal.exitCode !== undefined) return { key: "error", label: `Exited with code ${terminal.exitCode}` };
  if (terminal.ptyStatus === "exited") return { key: "stopped", label: "Stopped" };
  return { key: "idle", label: "Idle" };
}

function terminalStatusDot(terminal) {
  const status = terminalStatusState(terminal);
  return `<span class="terminal-status ${status.key}" role="img" aria-label="${escapeAttribute(status.label)}" title="${escapeAttribute(status.label)}"></span>`;
}

const previousBindTerminalControls = bindTerminalControls;
bindTerminalControls = function bindPtyTerminalControls() {
  previousBindTerminalControls();
  document.querySelectorAll("[data-terminal-agent]").forEach((button) => button.addEventListener("click", () => { setupAgent = normalizeTerminalAgent(button.dataset.terminalAgent); render(); }));
  document.querySelectorAll("[data-terminal-new-agent]").forEach((button) => button.addEventListener("click", () => createTerminal(button.dataset.terminalNewAgent || setupAgent, true)));
  document.querySelectorAll("[data-terminal-input]").forEach((node) => {
    bindPtyInput(node);
  });
  document.querySelectorAll("[data-terminal]").forEach((node) => {
    if (node.dataset.ptyFocusBound) return;
    node.dataset.ptyFocusBound = "1";
    node.addEventListener("pointerdown", (event) => {
      if (event.target?.closest?.("button, select, option, .terminal-menu")) return;
      focusPtyTerminal(node.dataset.terminal);
    });
  });
  mountVisibleXterms();
  if (typeof bindTerminalWorkspaceIndicators === "function") bindTerminalWorkspaceIndicators(document);
};

function requestCloseTerminal(id) {
  if (!confirmClosePtyTerminal(id)) return;
  closeTerminal(id);
}

async function requestCloseAllPtyTerminals() {
  const count = terminals.length;
  if (!count) return;
  const preservesWorktrees = terminals.some((terminal) => terminal.workspaceMode === "worktree")
    ? " Local Git branches and worktrees will be preserved."
    : "";
  if (!window.confirm(`Close all ${count} terminals? This ends running agents and removes their saved terminal context.${preservesWorktrees}`)) return;
  terminalToolbarMenuOpen = false;
  try {
    const response = await fetch("/desktop/pty-terminals/close-all", { method: "POST" });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || "Desktop could not close all terminals.");
  } catch (error) {
    const active = findTerminal(activeTerminalId) || terminals[0];
    if (active && typeof setPtyInputNotice === "function") {
      setPtyInputNotice(active.id, error instanceof Error ? error.message : "Desktop could not close all terminals.");
    }
    return;
  }
  if (typeof removeLocalPtyTerminal === "function") terminals.forEach(removeLocalPtyTerminal);
  terminals = [];
  activeTerminalId = "";
  settingsTerminalId = "";
  forceTerminalRender = true;
  saveTerminals();
  render();
}

function confirmClosePtyTerminal(id) {
  const terminal = findTerminal(id);
  if (!terminal) return true;
  const running = terminal.pending || terminal.ptyStatus === "starting" || terminal.ptyStatus === "running";
  const hasContext = Boolean(String(terminal.output || terminal.draft || "").trim() || (terminal.messages || []).length);
  if (!running && !hasContext) return true;
  const title = terminal.title || "this terminal";
  const workspace = terminal.workspaceMode === "worktree" ? " Its local Git branch and worktree will be preserved." : "";
  return window.confirm("Close " + title + "? This ends the agent and removes its saved terminal context on this computer." + workspace);
}

const previousCloseTerminal = closeTerminal;
closeTerminal = async function closePtyTerminal(id) {
  const terminal = findTerminal(id);
  if (terminal) {
    try {
      const response = await fetch(`/desktop/pty-terminals/${encodeURIComponent(id)}/close`, { method: "POST" });
      if (!response.ok) throw new Error("Desktop could not stop this terminal.");
    } catch (error) {
      if (typeof setPtyInputNotice === "function") setPtyInputNotice(id, error instanceof Error ? error.message : "Desktop could not stop this terminal.");
      return;
    }
  }
  const socket = terminalPtySockets[id];
  if (socket) socket.close();
  clearTimeout(terminalPtyReconnectTimers[id]);
  terminalXterms[id]?.dispose?.();
  delete terminalXterms[id];
  delete terminalXtermSizes[id];
  delete terminalXtermSnapshots[id];
  delete terminalXtermReplayWrites[id];
  delete terminalPtySockets[id];
  delete terminalPtyReconnectTimers[id];
  delete terminalPtyReconnectAttempts[id];
  previousCloseTerminal(id);
};
