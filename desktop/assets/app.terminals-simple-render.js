let terminalToolbarMenuOpen = false;
let terminalAdvancedNewOpen = false;
let terminalSidebarMode = localStorage.getItem("vibyra.desktop.terminalSidebarTool") === "memory" ? "memory" : "voice";

const openTerminalCompanionPanelBeforeSimpleUi = openTerminalCompanionPanel;
openTerminalCompanionPanel = function openSimpleTerminalSidebar(mode = "", source = "terminal") {
  if (mode === "voice" || mode === "memory") {
    terminalSidebarMode = mode;
    localStorage.setItem("vibyra.desktop.terminalSidebarTool", mode);
  }
  const result = openTerminalCompanionPanelBeforeSimpleUi(mode, source);
  if (activePage === "terminals") requestAnimationFrame(() => renderTopbar());
  return result;
};

const closeTerminalCompanionPanelBeforeSimpleUi = closeTerminalCompanionPanel;
closeTerminalCompanionPanel = function closeSimpleTerminalSidebar() {
  if (terminalCompanionMode === "voice" || terminalCompanionMode === "memory") {
    terminalSidebarMode = terminalCompanionMode;
  }
  const result = closeTerminalCompanionPanelBeforeSimpleUi();
  if (activePage === "terminals") requestAnimationFrame(() => renderTopbar());
  return result;
};

const createTerminalBeforeSimpleUi = createTerminal;
createTerminal = function createSimpleTerminal(modelKey = setupModel, shouldRender = true, options = {}) {
  const terminal = createTerminalBeforeSimpleUi(modelKey, shouldRender, options);
  if (!terminal) return terminal;
  if (options.agent) {
    terminal.agent = normalizeTerminalAgent(options.agent);
    const agent = terminalAgent(terminal);
    const count = terminals.filter((item) => normalizeTerminalAgent(item.agent) === agent.key).length;
    terminal.title = `${agent.label}${count > 1 ? ` ${count}` : ""}`;
    saveTerminals();
    if (shouldRender) renderTopbar();
  }
  return terminal;
};

function terminalSimpleAgentLabel(terminal) {
  const agent = terminalAgent(terminal);
  if (agent.key !== "vibyra") return agent.label;
  const provider = terminalProviderKeyForModel(terminal?.model);
  if (provider === "openai") return "Codex";
  if (provider === "claude") return "Claude";
  if (provider === "gemini") return "Gemini";
  return agent.label;
}

function terminalHeaderAction(terminal) {
  return `<button class="terminal-settings-button" type="button" data-terminal-settings="${escapeAttribute(terminal.id)}" aria-label="Terminal settings" title="Terminal settings">${icon("menu")}</button>`;
}

function terminalSimpleClasses(terminal, base) {
  return [base, terminalProviderClass(terminal), terminal.id === activeTerminalId ? "active" : "", terminal.notice ? "has-notice" : ""].filter(Boolean).join(" ");
}

activeTerminalView = function simpleActiveTerminalView(terminal) {
  const active = terminal.id === activeTerminalId;
  return `<article class="${terminalSimpleClasses(terminal, "terminal-focus")}${active ? "" : " terminal-focus-hidden"}" data-terminal="${escapeAttribute(terminal.id)}" aria-hidden="${active ? "false" : "true"}">
    <header class="terminal-focus-head"><div class="terminal-name">${terminalStatusDot(terminal)}<span><strong>${escapeHtml(terminal.title)}</strong><small>${escapeHtml(terminalSimpleAgentLabel(terminal))}</small></span></div>${terminalHeaderAction(terminal)}${settingsTerminalId === terminal.id ? settingsMenu(terminal) : ""}</header>
    ${terminal.notice ? terminalNotice(terminal) : ""}${terminalViewport(terminal)}
  </article>`;
};

terminalTile = function simpleTerminalTile(terminal) {
  return `<article class="${terminalSimpleClasses(terminal, "terminal-tile")}" data-terminal="${escapeAttribute(terminal.id)}">
    <header class="terminal-tile-head"><button type="button" data-terminal-focus="${escapeAttribute(terminal.id)}">${terminalStatusDot(terminal)}<span><strong>${escapeHtml(terminal.title)}</strong><small>${escapeHtml(terminalSimpleAgentLabel(terminal))}</small></span></button>${terminalHeaderAction(terminal)}${settingsTerminalId === terminal.id ? settingsMenu(terminal) : ""}</header>
    ${terminal.notice ? terminalNotice(terminal) : ""}${terminalViewport(terminal)}
  </article>`;
};

settingsMenu = function simpleTerminalDetails(terminal) {
  const model = terminalModelForDisplay(terminal.model);
  const project = projectForTerminal(terminal);
  const effort = (config().chatEfforts || []).find((item) => item.value === terminal.effort)?.label || terminal.effort || "Balanced";
  const access = terminal.permissionMode === "full" ? "Full access" : "Standard";
  return `<div class="terminal-menu terminal-settings-menu terminal-details-menu" role="dialog" aria-label="Terminal settings">
    <div class="terminal-details-head"><span>${icon("terminal")}</span><div><strong>${escapeHtml(terminal.title)}</strong><small>Session settings</small></div></div>
    <div class="terminal-detail-list">
      <span><small>Agent</small><strong>${escapeHtml(terminalSimpleAgentLabel(terminal))}</strong></span>
      <span><small>Model</small><strong>${escapeHtml(model.label)}</strong></span>
      <span><small>Reasoning</small><strong>${escapeHtml(effort)}</strong></span>
      <span><small>Project</small><strong>${escapeHtml(project?.name || "No project")}</strong></span>
      <span class="${terminal.permissionMode === "full" ? "danger" : ""}"><small>Access</small><strong>${escapeHtml(access)}</strong></span>
    </div>
    ${terminalTokenSourcePanel(model, terminal.tokenMode, terminal.id)}
    <button class="terminal-close-row" type="button" data-terminal-close="${escapeAttribute(terminal.id)}">${icon("trash")}<span>Close terminal</span></button>
  </div>`;
};

newTerminalMenu = function simpleNewTerminalMenu() {
  if (terminalAdvancedNewOpen) {
    const query = newTerminalModelSearch;
    const groups = filteredTerminalModelGroups(query);
    const models = groups.length
      ? groups.map((group) => terminalModelSection(group, selectedSetupModel().key, "data-terminal-new-model")).join("")
      : `<p class="terminal-model-empty">No models found</p>`;
    return `<div class="terminal-menu terminal-model-picker terminal-advanced-picker" data-terminal-model-picker="new">
      <button class="terminal-menu-back" type="button" data-terminal-new-back>${icon("chevron")}<span>Choose an agent</span></button>
      ${terminalProjectSelect("new")}
      <label class="terminal-model-search">${icon("search")}<input data-terminal-model-search="new" value="${escapeAttribute(query)}" placeholder="Search models" autocomplete="off" /></label>
      <div class="terminal-model-scroll" role="listbox" aria-label="Models">${models}</div>
    </div>`;
  }
  const rows = terminalAgents.map((agent) => {
    const unavailable = agent.available === false;
    return `<button type="button" data-terminal-simple-agent="${escapeAttribute(agent.key)}" ${unavailable ? "disabled" : ""}>${terminalStatusDot({ ptyStatus: unavailable ? "unavailable" : "idle" })}<span><strong>${escapeHtml(agent.label)}</strong><small>${escapeHtml(unavailable ? "Not installed" : agent.detail)}</small></span></button>`;
  }).join("");
  return `<div class="terminal-menu terminal-agent-menu" role="menu">
    <div class="terminal-menu-head"><span>${icon("plus")}</span><div><strong>New terminal</strong><small>Choose an AI agent</small></div></div>
    ${rows}
    <button class="terminal-agent-advanced" type="button" data-terminal-new-advanced>${icon("tool")}<span><strong>Advanced setup</strong><small>Choose project and model</small></span>${icon("chevron")}</button>
  </div>`;
};

terminalTabs = function simpleTerminalTabs() {
  const tabs = terminals.map((terminal) => {
    const active = terminal.id === activeTerminalId;
    return `<div class="terminal-tab ${active ? "active" : ""}" draggable="true" data-terminal-drag="${escapeAttribute(terminal.id)}" title="${escapeAttribute(terminal.title)}">
      <button class="terminal-tab-open" type="button" role="tab" aria-selected="${active}" data-terminal-focus="${escapeAttribute(terminal.id)}">${terminalStatusDot(terminal)}<span>${escapeHtml(terminalSimpleAgentLabel(terminal))}</span></button>
      <button class="terminal-tab-close" type="button" data-terminal-close="${escapeAttribute(terminal.id)}" aria-label="Close ${escapeAttribute(terminal.title)}">${icon("close")}</button>
    </div>`;
  }).join("");
  const menu = terminalToolbarMenuOpen ? `<div class="terminal-menu terminal-toolbar-menu"><div class="terminal-toolbar-summary"><strong>${terminals.length} terminal${terminals.length === 1 ? "" : "s"}</strong><small>Ctrl+Tab to switch</small></div><button class="danger" type="button" data-terminal-close-all>${icon("trash")}<span>Close all terminals</span></button></div>` : "";
  return `<header class="terminal-tabs">
    <div class="terminal-top-left"><div class="terminal-new-wrap"><button class="terminal-add terminal-create-button" id="open-terminal-new" type="button" aria-label="New terminal" title="New terminal (Ctrl+T)" ${terminals.length >= maxTerminals ? "disabled" : ""}>${icon("plus")}<span>New</span></button>${newTerminalMenuOpen ? newTerminalMenu() : ""}</div></div>
    <div class="terminal-tab-list" role="tablist" aria-label="AI terminals">${tabs}</div>
    <div class="terminal-top-actions">
      ${terminalCompanionToolbarHtml()}
      <button class="terminal-layout-button ${terminalLayout === "grid" ? "active" : ""}" id="toggle-terminal-layout" type="button" aria-label="${terminalLayout === "grid" ? "Use focus view" : "Use grid view"}" title="${terminalLayout === "grid" ? "Focus view" : "Grid view"}">${icon(terminalLayout === "grid" ? "terminal" : "grid")}</button>
      <div class="terminal-toolbar-wrap"><button class="terminal-layout-button" id="open-terminal-toolbar" type="button" aria-label="Terminal options" title="Terminal options">${icon("menu")}</button>${menu}</div>
    </div>
  </header>`;
};

terminalCompanionToolbarHtml = function simpleCompanionToolbar() {
  const active = terminalCompanionMode === "voice" || terminalCompanionMode === "memory";
  return `<button class="terminal-companion-launcher terminal-sidebar-toggle ${active ? "active" : ""}" type="button" data-terminal-sidebar-toggle aria-pressed="${active}" title="Toggle Vibyra AI sidebar">${icon("sparkles")}<span>Vibyra AI</span></button>`;
};

const createTerminalFromModelBeforeSimpleUi = createTerminalFromModel;
createTerminalFromModel = function createSimpleTerminalFromModel(key) {
  const model = modelByKey(key);
  if (typeof modelLocked === "function" && modelLocked(model)) return createTerminalFromModelBeforeSimpleUi(key);
  const projectId = typeof terminalProjectForSetup === "function" ? terminalProjectForSetup() : setupProjectId;
  newTerminalModelSearch = "";
  terminalProjectMenuTarget = "";
  terminalAdvancedNewOpen = false;
  createTerminal(model.key, true, { projectId });
};
