const terminalMaximizedKey = "vibyra.desktop.maximizedTerminal";
let maximizedTerminalId = localStorage.getItem(terminalMaximizedKey) || "";
let terminalToolbarMenuOpen = false;

const normalizeTerminalBeforeSimpleUi = normalizeTerminal;
normalizeTerminal = function normalizeSimpleTerminal(item) {
  const terminal = normalizeTerminalBeforeSimpleUi(item);
  if (terminal) terminal.minimized = Boolean(item?.minimized);
  return terminal;
};

const createTerminalBeforeSimpleUi = createTerminal;
createTerminal = function createSimpleTerminal(modelKey = setupModel, shouldRender = true, options = {}) {
  const terminal = createTerminalBeforeSimpleUi(modelKey, shouldRender, options);
  if (!terminal) return terminal;
  terminal.minimized = false;
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

function terminalWindowActions(terminal) {
  const minimized = Boolean(terminal.minimized);
  const maximized = maximizedTerminalId === terminal.id;
  return `<div class="terminal-window-actions">
    <button type="button" data-terminal-minimize="${escapeAttribute(terminal.id)}" aria-label="${minimized ? "Restore" : "Minimize"} ${escapeAttribute(terminal.title)}" title="${minimized ? "Restore" : "Minimize"}">${icon(minimized ? "square" : "minus")}</button>
    <button type="button" data-terminal-maximize="${escapeAttribute(terminal.id)}" aria-label="${maximized ? "Restore" : "Maximize"} ${escapeAttribute(terminal.title)}" title="${maximized ? "Restore" : "Maximize"}">${icon(maximized ? "grid" : "square")}</button>
    <button type="button" data-terminal-settings="${escapeAttribute(terminal.id)}" aria-label="Terminal details" title="Terminal details">${icon("menu")}</button>
    <button type="button" data-terminal-close="${escapeAttribute(terminal.id)}" aria-label="Close ${escapeAttribute(terminal.title)}" title="Close">${icon("close")}</button>
  </div>`;
}

function terminalSimpleClasses(terminal, base) {
  const classes = [base, terminalProviderClass(terminal)];
  if (terminal.id === activeTerminalId) classes.push("active");
  if (terminal.minimized) classes.push("terminal-minimized");
  if (maximizedTerminalId === terminal.id) classes.push("terminal-maximized");
  if (maximizedTerminalId && maximizedTerminalId !== terminal.id) classes.push("terminal-maximized-hidden");
  if (terminal.notice) classes.push("has-notice");
  return classes.join(" ");
}

activeTerminalView = function simpleActiveTerminalView(terminal) {
  const active = terminal.id === activeTerminalId;
  const hidden = active ? "" : " terminal-focus-hidden";
  return `<article class="${terminalSimpleClasses(terminal, "terminal-focus")}${hidden}" data-terminal="${escapeAttribute(terminal.id)}" aria-hidden="${active ? "false" : "true"}">
    <header class="terminal-focus-head"><div class="terminal-name">${terminalStatusDot(terminal)}<strong>${escapeHtml(terminal.title)}</strong><small>${escapeHtml(terminalSimpleAgentLabel(terminal))}</small></div>${terminalWindowActions(terminal)}${settingsTerminalId === terminal.id ? settingsMenu(terminal) : ""}</header>
    ${terminal.notice ? terminalNotice(terminal) : ""}${terminalViewport(terminal)}
  </article>`;
};

terminalTile = function simpleTerminalTile(terminal) {
  return `<article class="${terminalSimpleClasses(terminal, "terminal-tile")}" data-terminal="${escapeAttribute(terminal.id)}">
    <header class="terminal-tile-head"><button type="button" data-terminal-focus="${escapeAttribute(terminal.id)}">${terminalStatusDot(terminal)}<strong>${escapeHtml(terminal.title)}</strong><small>${escapeHtml(terminalSimpleAgentLabel(terminal))}</small></button>${terminalWindowActions(terminal)}${settingsTerminalId === terminal.id ? settingsMenu(terminal) : ""}</header>
    ${terminal.notice ? terminalNotice(terminal) : ""}${terminalViewport(terminal)}
  </article>`;
};

settingsMenu = function simpleTerminalDetails(terminal) {
  const model = terminalModelForDisplay(terminal.model);
  const project = projectForTerminal(terminal);
  const access = terminal.permissionMode === "full" ? "Full access" : "Standard";
  return `<div class="terminal-menu terminal-settings-menu terminal-details-menu" role="dialog" aria-label="Terminal details">
    <strong>Terminal details</strong>
    <span><small>Agent</small>${escapeHtml(terminalSimpleAgentLabel(terminal))}</span>
    <span><small>Model</small>${escapeHtml(model.label)}</span>
    <span><small>Project</small>${escapeHtml(project?.name || "No project")}</span>
    <span><small>Access</small>${escapeHtml(access)}</span>
  </div>`;
};

newTerminalMenu = function simpleNewTerminalMenu() {
  const rows = terminalAgents.map((agent) => {
    const unavailable = agent.available === false;
    return `<button type="button" data-terminal-simple-agent="${escapeAttribute(agent.key)}" ${unavailable ? "disabled" : ""}>
      ${terminalStatusDot({ ptyStatus: unavailable ? "unavailable" : "idle" })}
      <span><strong>${escapeHtml(agent.label)}</strong><small>${escapeHtml(unavailable ? "Not installed" : agent.detail)}</small></span>
    </button>`;
  }).join("");
  return `<div class="terminal-menu terminal-agent-menu" role="menu"><p>New terminal</p>${rows}</div>`;
};

terminalTabs = function simpleTerminalTabs() {
  const tabs = terminals.map((terminal) => {
    const active = terminal.id === activeTerminalId;
    const label = terminalSimpleAgentLabel(terminal);
    return `<div class="terminal-tab ${active ? "active" : ""}" draggable="true" data-terminal-drag="${escapeAttribute(terminal.id)}" title="${escapeAttribute(terminal.title)}">
      <button class="terminal-tab-open" type="button" role="tab" aria-selected="${active}" data-terminal-focus="${escapeAttribute(terminal.id)}">${terminalStatusDot(terminal)}<span>${escapeHtml(label)}</span></button>
      <button class="terminal-tab-close" type="button" data-terminal-close="${escapeAttribute(terminal.id)}" aria-label="Close ${escapeAttribute(terminal.title)}">${icon("close")}</button>
    </div>`;
  }).join("");
  const tools = terminalCompanionToolbarHtml();
  const menu = terminalToolbarMenuOpen ? `<div class="terminal-menu terminal-toolbar-menu">
    <button type="button" id="toggle-terminal-layout">${icon(terminalLayout === "grid" ? "terminal" : "grid")}<span>${terminalLayout === "grid" ? "Focus view" : "Grid view"}</span></button>
    <button class="danger" type="button" data-terminal-close-all>${icon("trash")}<span>Close all terminals</span></button>
  </div>` : "";
  return `<header class="terminal-tabs">
    <div class="terminal-new-wrap"><button class="terminal-add" id="open-terminal-new" type="button" aria-label="New terminal" title="New terminal" ${terminals.length >= maxTerminals ? "disabled" : ""}>${icon("plus")}</button>${newTerminalMenuOpen ? newTerminalMenu() : ""}</div>
    <div class="terminal-tab-list" role="tablist" aria-label="AI terminals">${tabs}</div>
    ${tools}
    <div class="terminal-toolbar-wrap"><button class="terminal-layout-button" id="open-terminal-toolbar" type="button" aria-label="Terminal options" title="Terminal options">${icon("menu")}</button>${menu}</div>
  </header>`;
};

terminalCompanionToolbarHtml = function simpleCompanionToolbar() {
  const active = Boolean(terminalCompanionMode);
  return `<button class="terminal-companion-launcher terminal-companion-launcher--single ${active ? "active" : ""}" type="button" data-terminal-companion-toggle aria-pressed="${active}">${icon("sparkles")}<span>Vibyra AI</span></button>`;
};
