function persistTerminalWindowState() {
  if (maximizedTerminalId) localStorage.setItem(terminalMaximizedKey, maximizedTerminalId);
  else localStorage.removeItem(terminalMaximizedKey);
  saveTerminals();
}

function refreshTerminalWindowClasses() {
  const page = nodes.content.querySelector(".terminal-page");
  if (!page) return;
  page.classList.toggle("terminal-page--terminal-maximized", Boolean(maximizedTerminalId));
  terminals.forEach((terminal) => {
    const article = page.querySelector(`[data-terminal="${CSS.escape(terminal.id)}"]`);
    if (!article) return;
    const maximized = maximizedTerminalId === terminal.id;
    article.classList.toggle("terminal-minimized", Boolean(terminal.minimized));
    article.classList.toggle("terminal-maximized", maximized);
    article.classList.toggle("terminal-maximized-hidden", Boolean(maximizedTerminalId) && !maximized);
    const minimize = article.querySelector("[data-terminal-minimize]");
    if (minimize) {
      minimize.innerHTML = icon(terminal.minimized ? "square" : "minus");
      minimize.title = terminal.minimized ? "Restore" : "Minimize";
    }
    const maximize = article.querySelector("[data-terminal-maximize]");
    if (maximize) {
      maximize.innerHTML = icon(maximized ? "grid" : "square");
      maximize.title = maximized ? "Restore" : "Maximize";
    }
  });
}

function toggleTerminalMinimized(id) {
  const terminal = findTerminal(id);
  if (!terminal) return;
  terminal.minimized = !terminal.minimized;
  if (terminal.minimized && maximizedTerminalId === id) maximizedTerminalId = "";
  activeTerminalId = id;
  settingsTerminalId = "";
  persistTerminalWindowState();
  refreshTerminalWindowClasses();
  renderTopbar();
  if (!terminal.minimized) requestAnimationFrame(() => mountVisibleXterms());
}

function toggleTerminalMaximized(id) {
  const terminal = findTerminal(id);
  if (!terminal) return;
  const restoring = maximizedTerminalId === id;
  maximizedTerminalId = restoring ? "" : id;
  terminal.minimized = false;
  activeTerminalId = id;
  settingsTerminalId = "";
  persistTerminalWindowState();
  refreshTerminalWindowClasses();
  renderTopbar();
  requestAnimationFrame(() => mountVisibleXterms());
}

function createTerminalForAgent(agentKey) {
  const agent = terminalAgents.find((item) => item.key === agentKey);
  if (!agent || agent.available === false) return;
  setupAgent = agent.key;
  newTerminalMenuOpen = false;
  createTerminal(agentDefaultModel(agent), true, { agent: agent.key });
}

async function requestCloseAllTerminals() {
  const ids = terminals.map((terminal) => terminal.id);
  if (!ids.length) return;
  const running = terminals.some((terminal) => terminal.pending || ["starting", "running"].includes(terminal.ptyStatus));
  const message = running
    ? `Close all ${ids.length} terminals? Running agents will stop and their saved terminal context will be removed.`
    : `Close all ${ids.length} terminals and remove their saved context?`;
  if (!window.confirm(message)) return;
  terminalToolbarMenuOpen = false;
  maximizedTerminalId = "";
  for (const id of ids) await closeTerminal(id);
}

const setActiveTerminalBeforeSimpleUi = setActiveTerminal;
setActiveTerminal = function setActiveSimpleTerminal(id) {
  const terminal = findTerminal(id);
  if (terminal) terminal.minimized = false;
  if (maximizedTerminalId && maximizedTerminalId !== id) maximizedTerminalId = "";
  persistTerminalWindowState();
  setActiveTerminalBeforeSimpleUi(id);
};

const refreshPtyTerminalsDomBeforeSimpleUi = refreshPtyTerminalsDom;
refreshPtyTerminalsDom = function refreshSimplePtyTerminalsDom() {
  const result = refreshPtyTerminalsDomBeforeSimpleUi();
  refreshTerminalWindowClasses();
  return result;
};

const bindPtyTopbarControlsBeforeSimpleUi = bindPtyTopbarControls;
bindPtyTopbarControls = function bindSimplePtyControls() {
  bindPtyTopbarControlsBeforeSimpleUi();
  bindPtyClick(document.getElementById("open-terminal-toolbar"), () => {
    terminalToolbarMenuOpen = !terminalToolbarMenuOpen;
    newTerminalMenuOpen = false;
    renderTopbar();
    bindPtyTopbarControls();
  });
  document.querySelectorAll("[data-terminal-simple-agent]").forEach((button) => bindPtyClick(button, () => createTerminalForAgent(button.dataset.terminalSimpleAgent)));
  document.querySelectorAll("[data-terminal-minimize]").forEach((button) => bindPtyClick(button, (event) => {
    event.stopPropagation();
    toggleTerminalMinimized(button.dataset.terminalMinimize);
  }));
  document.querySelectorAll("[data-terminal-maximize]").forEach((button) => bindPtyClick(button, (event) => {
    event.stopPropagation();
    toggleTerminalMaximized(button.dataset.terminalMaximize);
  }));
  document.querySelectorAll("[data-terminal-close-all]").forEach((button) => bindPtyClick(button, () => void requestCloseAllTerminals()));
  document.querySelectorAll("[data-terminal-companion-toggle]").forEach((button) => bindPtyClick(button, () => {
    if (terminalCompanionMode) closeTerminalCompanionPanel();
    else openTerminalCompanionPanel("voice", "toolbar");
  }));
  document.querySelectorAll("[data-terminal-drag]").forEach((tab) => {
    if (tab.dataset.simpleDragBound) return;
    tab.dataset.simpleDragBound = "1";
    bindTerminalDrag(tab);
  });
};

const closeTerminalBeforeSimpleUi = closeTerminal;
closeTerminal = async function closeSimpleTerminal(id) {
  if (maximizedTerminalId === id) maximizedTerminalId = "";
  await closeTerminalBeforeSimpleUi(id);
  persistTerminalWindowState();
};

window.addEventListener("load", () => {
  if (maximizedTerminalId && !findTerminal(maximizedTerminalId)) {
    maximizedTerminalId = "";
    localStorage.removeItem(terminalMaximizedKey);
  }
});
