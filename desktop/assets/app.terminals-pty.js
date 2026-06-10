const terminalPtySockets = {};
const terminalPtyRenderTimers = {};
const terminalPtyReconnectTimers = {};
const terminalPtyReconnectAttempts = {};
const terminalXterms = {};
const terminalXtermSizes = {};
const terminalXtermSnapshots = {};
const terminalXtermReplayWrites = {};
let ptyRenderedSignature = "";
let terminalSetupStep = "mode";

function resetTerminalSetupFlow() {
  terminalSetupStep = "mode";
}

function selectTerminalSetupMode(mode) {
  const capacity = terminalBatchSetupOpen ? terminalBatchAvailableSlots() : maxTerminals;
  setupCount = mode === "team" ? Math.min(4, capacity) : 1;
  terminalSetupStep = "setup";
  render();
}

function terminalSetupProgress(current) {
  const steps = [
    { key: "mode", number: 1, label: "Workspace" },
    { key: "setup", number: 2, label: "Setup" },
    { key: "terminals", number: 3, label: "Terminals" }
  ];
  const currentIndex = steps.findIndex((step) => step.key === current);
  return `<nav class="terminal-setup-progress" aria-label="Terminal setup progress">${steps.map((step, index) => {
    const state = index < currentIndex ? "complete" : index === currentIndex ? "current" : "";
    const content = `<i>${index < currentIndex ? icon("check") : step.number}</i><em>${step.label}</em>`;
    return index < currentIndex && current !== "terminals"
      ? `<button class="${state}" type="button" data-terminal-setup-go="${step.key}" aria-label="Back to ${step.label}">${content}</button>`
      : `<span class="${state}" ${index === currentIndex ? 'aria-current="step"' : ""}>${content}</span>`;
  }).join("")}</nav>`;
}

function terminalSetupGridPreview(count) {
  const total = normalizeCount(count);
  const meta = terminalGridMeta(total);
  const cells = Array.from({ length: total }, (_, index) => `<span><i>${index + 1}</i></span>`).join("");
  return `<div class="terminal-setup-grid-preview" style="--setup-preview-cols:${meta.cols};--setup-preview-rows:${meta.rows}" aria-label="${total} terminal grid preview">${cells}</div>`;
}
const terminalPtyRendererVersion = 2;
const terminalAgents = [
  { key: "vibyra", label: "Vibyra", detail: "OpenRouter terminal", profile: "auto" },
  { key: "codex", label: "Codex", detail: "OpenAI Codex CLI", profile: "openai" },
  { key: "claude", label: "Claude", detail: "Claude Code CLI", profile: "claude" },
  { key: "gemini", label: "Gemini", detail: "Gemini CLI", profile: "gemini" },
  { key: "shell", label: "Shell", detail: "Login shell", profile: "auto" }
];
let setupAgent = localStorage.getItem("vibyra.desktop.terminalAgent") || "vibyra";

function agentForModel(model, tokenMode = "vibyra") {
  if (tokenMode !== "provider") return "vibyra";
  if (typeof terminalOwnAccountRoute === "function") {
    return terminalOwnAccountRoute(model).agent || "vibyra";
  }
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
  if (modelKey && modelKey !== "auto") return agentForModel(terminalModelForDisplay(modelKey), terminal.tokenMode);
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
  const stored = terminals.map(({ initialPrompt, initialAssignmentId, pending, notice, output, ptyStartQueued, restoringFromSnapshot, taskActivity, ...terminal }) => ({ ...terminal, ptyRendererVersion: terminalPtyRendererVersion })).slice(0, maxTerminals);
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
  const agent = normalizeTerminalAgent(terminal?.agent);
  if (agent === "claude") return terminalProfiles.claude;
  if (agent === "codex") return terminalProfiles.openai;
  if (agent === "gemini") return terminalProfiles.gemini;
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
  const effort = terminalEffortForModel(model, options.effort);
  const initialPrompt = normalizeInitialTerminalPrompt(options.initialPrompt);
  const requestedTokenMode = ["provider", "vibyra"].includes(options.tokenMode)
    ? options.tokenMode
    : setupTokenMode;
  const tokenMode = typeof terminalTokenModeForModel === "function"
    ? terminalTokenModeForModel(model, requestedTokenMode)
    : requestedTokenMode;
  if (typeof terminalModelAvailableForTokenMode === "function" && !terminalModelAvailableForTokenMode(model, tokenMode)) {
    providerConnectNotice = terminalTokenSourceIssue(model, tokenMode);
    if (shouldRender) render();
    return null;
  }
  const runtimeIssue = typeof terminalRuntimeLaunchIssueForRequest === "function"
    ? terminalRuntimeLaunchIssueForRequest(model, tokenMode, initialPrompt)
    : typeof terminalRuntimeLaunchIssue === "function"
      ? terminalRuntimeLaunchIssue(model, tokenMode)
      : "";
  if (runtimeIssue) {
    terminalRuntimeNotice = runtimeIssue;
    if (shouldRender) render();
    return null;
  }
  const agent = agentForModel(model, tokenMode);
  const terminal = {
    id: terminalId(),
    title: typeof terminalRandomName === "function" ? terminalRandomName() : `${model.label} ${terminals.length + 1}`,
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
    initialPrompt,
    updatedAt: Date.now(),
    messages: []
  };
  terminals.push(terminal);
  activeTerminalId = terminal.id;
  if (typeof activateTerminalProjectForTerminal === "function") activateTerminalProjectForTerminal(terminal);
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
  for (let index = 0; index < total; index += 1) {
    createTerminal(model.key, false, { ...options, initialPrompt: index === 0 ? options.initialPrompt : "" });
  }
  resetTerminalSetupFlow();
  forceTerminalRender = true;
  render();
};

setupView = function ptySetupView() {
  const model = selectedSetupModel();
  const setupCapacity = terminalBatchSetupOpen ? terminalBatchAvailableSlots() : maxTerminals;
  const requestedProjectId = setupProjectId;
  let selectedProjectId = terminalProjectForSetup();
  if (requestedProjectId && !selectedProjectId) {
    const activeProjectId = activeTerminalProjectKey();
    if (terminalProject(activeProjectId)) {
      setupProjectId = activeProjectId;
      selectedProjectId = activeProjectId;
      localStorage.setItem(setupProjectKey, setupProjectId);
    }
  }
  const tokenMode = typeof terminalTokenModeForModel === "function"
    ? terminalTokenModeForModel(model, setupTokenMode)
    : setupTokenMode;
  if (tokenMode !== setupTokenMode) {
    setupTokenMode = tokenMode;
    localStorage.setItem("vibyra.desktop.terminalTokenMode", setupTokenMode);
  }
  const projectReady = typeof terminalProjectReadyForSetup !== "function" || terminalProjectReadyForSetup();
  const sourceIssue = typeof terminalTokenSourceIssue === "function" ? terminalTokenSourceIssue(model, tokenMode) : "";
  const runtimeLaunch = typeof terminalRuntimeLaunchState === "function"
    ? terminalRuntimeLaunchState(model, tokenMode)
    : { available: true, issue: "", reason: "", runtime: null };
  const runtimeIssue = runtimeLaunch.issue || "";
  const launchReady = projectReady && !sourceIssue && !runtimeIssue;
  const startDisabled = launchReady ? "" : "disabled";
  const launchCount = Math.min(setupCount, setupCapacity);
  const project = terminalProject(selectedProjectId);
  const team = launchCount > 1;
  if (terminalSetupStep === "mode") return terminalSetupModeView(project, setupCapacity);
  const startLabel = !projectReady
    ? "Loading project..."
    : sourceIssue
      ? "Connect an AI account"
      : `Start ${team ? "team" : "solo"} workspace`;
  const effort = terminalSetupEffortPicker(model);
  const advanced = terminalTokenSourcePanel(model, tokenMode, "setup");
  const counts = Array.from({ length: maxTerminals }, (_, index) => index + 1);
  return `<section class="terminal-setup terminal-setup--configure"><div class="terminal-setup-stage"><div class="terminal-setup-flow">
    ${terminalSetupProgress("setup")}
    <div class="terminal-setup-panel terminal-setup-panel--combined">
    <div class="terminal-setup-count-layout">
      <div class="terminal-setup-count-picker">
        <p>Terminal amount</p>
        <div class="terminal-setup-count-buttons" role="radiogroup" aria-label="Terminal amount">${counts.map((count) => `<button class="${launchCount === count ? "active" : ""}" type="button" role="radio" aria-checked="${launchCount === count}" data-terminal-count="${count}" ${count > setupCapacity ? "disabled" : ""}>${count}</button>`).join("")}</div>
        <small>${setupCapacity < maxTerminals ? `${setupCapacity} terminal slots available` : "Up to 12 terminals"}</small>
      </div>
      <div class="terminal-setup-preview-wrap"><span>Grid preview</span>${terminalSetupGridPreview(launchCount)}<small>${launchCount} terminal${launchCount === 1 ? "" : "s"}</small></div>
    </div>
    <div class="terminal-setup-grid">
      <div class="terminal-setup-block"><p>Project</p>${terminalProjectSelect("setup")}</div>
      <div class="terminal-setup-block"><p>Model</p><div class="terminal-model-select-wrap">${terminalModelSelectButton("setup", model)}${setupModelMenuOpen ? terminalModelMenu("setup", model.key) : ""}</div></div>
    </div>
    ${terminalWorkspaceSetupPicker()}
    ${effort}
    ${advanced ? `<details class="terminal-setup-advanced"><summary>${icon("settings")}<span>Advanced options</span>${icon("arrow")}</summary><div>${advanced}</div></details>` : ""}
    <div class="terminal-setup-actions">
      ${terminalBatchSetupOpen ? '<button class="secondary-button terminal-setup-cancel" type="button" data-terminal-batch-cancel>Cancel</button>' : ""}
      <button class="primary-button terminal-start-button" type="button" id="start-terminals" ${startDisabled}>${icon("arrow")}${escapeHtml(startLabel)}</button>
    </div>
  </div></div></div></section>`;
};

function terminalSetupModeView(project, setupCapacity) {
  const cancel = terminalBatchSetupOpen
    ? '<button class="terminal-setup-mode-cancel" type="button" data-terminal-batch-cancel>Cancel</button>'
    : "";
  const choice = (mode, iconName, title, detail, disabled = false) => `<button class="terminal-setup-mode-card" type="button" data-terminal-setup-mode="${mode}" ${disabled ? "disabled" : ""}>
    <span class="terminal-setup-mode-icon" aria-hidden="true">${icon(iconName)}</span>
    <span class="terminal-setup-mode-copy"><strong>${title}</strong><small>${detail}</small></span>
  </button>`;
  return `<section class="terminal-setup terminal-setup--mode"><div class="terminal-setup-stage"><div class="terminal-setup-flow terminal-setup-flow--mode">
    ${terminalSetupProgress("mode")}
    <div class="terminal-setup-panel terminal-setup-panel--mode">
    <div class="terminal-setup-mode-intro">
      <small>${escapeHtml(project?.name || "New AI workspace")}</small>
      <h1>How do you want to work?</h1>
      <p>Choose your workspace. You can adjust the details next.</p>
    </div>
    <div class="terminal-setup-mode-grid">
      ${choice("solo", "terminal", "Solo", "Best for focused builds, fixes, and quick changes")}
      ${choice("team", "people", "Team", "Best for larger work split across multiple agents", setupCapacity < 2)}
    </div>
    ${cancel}
  </div></div></div></section>`;
}

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
  return `<article class="terminal-focus ${terminalProviderClass(terminal)} ${hiddenClass} ${terminal.notice ? "has-notice" : ""}${terminalFullscreenClasses(terminal)}" data-terminal="${escapeAttribute(terminal.id)}"${hiddenAttr}><header class="terminal-focus-head"><div class="terminal-name">${terminalStatusDot(terminal)}<strong>${escapeHtml(terminal.title)}</strong><small>${escapeHtml(terminalAgentDisplayName(terminal))}</small></div><div class="terminal-meta">${modelMetaChip(terminal)}${terminalWindowActions(terminal)}${settingsTerminalId === terminal.id ? settingsMenu(terminal) : ""}</div></header>${terminal.notice ? terminalNotice(terminal) : ""}${terminalViewport(terminal)}</article>`;
};

terminalFocusViews = function ptyTerminalFocusViews() {
  return terminals.map(activeTerminalView).join("");
};

terminalTile = function ptyTerminalTile(terminal) {
  const active = terminal.id === activeTerminalId;
  const projectTerminals = typeof terminalsForProjectKey === "function" ? terminalsForProjectKey() : terminals;
  const projectIndex = projectTerminals.findIndex((item) => item.id === terminal.id);
  const projectVisible = projectIndex >= 0;
  const position = Math.max(1, projectIndex + 1);
  const workspaceChip = typeof terminalWorkspaceIndicator === "function" ? terminalWorkspaceIndicator(terminal) : "";
  return `<article class="terminal-tile ${terminalProviderClass(terminal)} ${active ? "active" : ""}${projectVisible ? "" : " terminal-project-hidden"}${terminalFullscreenClasses(terminal)}" data-terminal="${escapeAttribute(terminal.id)}"><header class="terminal-tile-head"><button type="button" data-terminal-focus="${escapeAttribute(terminal.id)}"><span class="terminal-grid-number">${position}</span>${terminalStatusDot(terminal)}<strong>${escapeHtml(terminal.title)}</strong><small>${escapeHtml(terminalAgentDisplayName(terminal))}</small></button><div class="terminal-window-actions-wrap">${workspaceChip}${terminalWindowActions(terminal)}${settingsTerminalId === terminal.id ? settingsMenu(terminal) : ""}</div></header>${terminalViewport(terminal)}</article>`;
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
  const rename = `<form class="terminal-rename-form" data-terminal-rename-form="${escapeAttribute(terminal.id)}"><span class="terminal-rename-icon">${icon("edit")}</span><input id="terminal-name-${escapeAttribute(terminal.id)}" type="text" maxlength="72" value="${escapeAttribute(terminal.title)}" data-terminal-rename-input autocomplete="off" aria-label="Terminal name" /><button type="submit" aria-label="Save terminal name" title="Save name">${icon("check")}</button><small data-terminal-rename-status aria-live="polite"></small></form>`;
  const pathSection = cwd ? `<div class="terminal-menu-section terminal-menu-technical">${cwd}</div>` : "";
  return `<div class="terminal-menu terminal-settings-menu" role="dialog" aria-label="Terminal options">${rename}<div class="terminal-menu-section">${projectRow}${workspaceRow}${permissionRow}</div>${pathSection}<button class="terminal-close-row" type="button" data-terminal-close="${escapeAttribute(terminal.id)}">${icon("trash")}<span>Close terminal</span></button></div>`;
};

terminalTopbarSubtitle = function ptyTerminalTopbarSubtitle() {
  ensureTerminal();
  const projectTerminals = typeof terminalsForProjectKey === "function" ? terminalsForProjectKey() : terminals;
  const running = projectTerminals.filter((terminal) => terminal.ptyStatus === "running" || terminal.pending).length;
  return `${projectTerminals.length}/${maxTerminals}${running ? ` running ${running}` : ""}`;
};

function terminalTabAgentLabel(terminal, index) {
  return terminal.title || `Agent ${index + 1}`;
}

terminalTabs = function ptyTerminalTabs() {
  const projectTerminals = typeof terminalsForProjectKey === "function" ? terminalsForProjectKey() : terminals;
  const tabs = projectTerminals.map((terminal, index) => {
    const active = terminal.id === activeTerminalId;
    const label = terminalTabAgentLabel(terminal, index);
    return `<div class="terminal-tab ${active ? "active" : ""}" draggable="true" data-terminal-drag="${escapeAttribute(terminal.id)}" title="${escapeAttribute(`${label}, ${terminalAgentDisplayName(terminal)}`)}"><button class="terminal-tab-open" type="button" role="tab" aria-selected="${active}" data-terminal-focus="${escapeAttribute(terminal.id)}" aria-label="Open ${escapeAttribute(label)}">${terminalStatusDot(terminal)}<span>${escapeHtml(label)}</span></button><button class="terminal-tab-close" type="button" data-terminal-close="${escapeAttribute(terminal.id)}" aria-label="Close ${escapeAttribute(label)}">${icon("close")}</button></div>`;
  }).join("");
  const companionTools = typeof terminalCompanionToolbarHtml === "function" ? terminalCompanionToolbarHtml() : "";
  const menu = terminalToolbarMenuOpen ? `<div class="terminal-menu terminal-toolbar-menu" role="menu">
    <button type="button" id="toggle-terminal-layout">${icon(terminalLayout === "grid" ? "terminal" : "grid")}<span>${terminalLayout === "grid" ? "Focus view" : "Grid view"}</span></button>
    <button class="danger" type="button" data-terminal-close-all>${icon("trash")}<span>Close all terminals</span></button>
  </div>` : "";
  return `<header class="terminal-tabs">${terminalWorkspaceDockIdentityHtml()}<div class="terminal-new-wrap"><button class="terminal-add" id="open-terminal-new" type="button" aria-label="New terminal" title="New terminal" ${terminals.length >= maxTerminals ? "disabled" : ""}>${icon("plus")}</button>${newTerminalMenuOpen ? newTerminalMenu() : ""}</div><div class="terminal-tab-list" role="tablist" aria-label="AI terminals">${tabs}</div>${terminalWorkspaceQuickActionsHtml()}${companionTools}<div class="terminal-toolbar-wrap"><button class="terminal-layout-button" id="open-terminal-toolbar" type="button" aria-haspopup="menu" aria-expanded="${terminalToolbarMenuOpen ? "true" : "false"}" aria-label="Terminal options" title="Terminal options">${icon("menu")}</button>${menu}</div></header>`;
};

function terminalStatusState(terminal) {
  if (terminal.autoAwaitingTask) return { key: "idle", label: "Auto ready for a task" };
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
  fullscreenTerminalId = "";
  localStorage.removeItem(terminalFullscreenKey);
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
  if (typeof cancelSettledPtyXtermFit === "function") cancelSettledPtyXtermFit(id);
  clearTimeout(terminalPtyReconnectTimers[id]);
  terminalXterms[id]?.dispose?.();
  if (typeof terminalEditorLinkProviders === "object") {
    terminalEditorLinkProviders[id]?.disposable?.dispose?.();
    delete terminalEditorLinkProviders[id];
  }
  delete terminalXterms[id];
  delete terminalXtermSizes[id];
  delete terminalXtermSnapshots[id];
  delete terminalXtermReplayWrites[id];
  delete terminalPtySockets[id];
  delete terminalPtyReconnectTimers[id];
  delete terminalPtyReconnectAttempts[id];
  previousCloseTerminal(id);
};
