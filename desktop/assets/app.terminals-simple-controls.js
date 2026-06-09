function createTerminalForAgent(agentKey) {
  const agent = terminalAgents.find((item) => item.key === agentKey);
  if (!agent || agent.available === false) return;
  setupAgent = agent.key;
  newTerminalMenuOpen = false;
  terminalAdvancedNewOpen = false;
  const projectId = typeof terminalProjectForSetup === "function" ? terminalProjectForSetup() : setupProjectId;
  createTerminal(agentDefaultModel(agent), true, { agent: agent.key, projectId });
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
  for (const id of ids) await closeTerminal(id);
}

const bindPtyTopbarControlsBeforeSimpleUi = bindPtyTopbarControls;
bindPtyTopbarControls = function bindSimplePtyControls() {
  bindPtyTopbarControlsBeforeSimpleUi();
  const newButton = document.getElementById("open-terminal-new");
  if (newButton && !newButton.dataset.simpleResetBound) {
    newButton.dataset.simpleResetBound = "1";
    newButton.addEventListener("click", () => {
      if (!newTerminalMenuOpen) terminalAdvancedNewOpen = false;
      terminalToolbarMenuOpen = false;
    }, true);
  }
  bindPtyClick(document.getElementById("open-terminal-toolbar"), () => {
    terminalToolbarMenuOpen = !terminalToolbarMenuOpen;
    newTerminalMenuOpen = false;
    terminalAdvancedNewOpen = false;
    renderTopbar();
    bindPtyTopbarControls();
  });
  document.querySelectorAll("[data-terminal-new-advanced]").forEach((button) => bindPtyClick(button, () => {
    terminalAdvancedNewOpen = true;
    renderTopbar();
    bindPtyTopbarControls();
  }));
  document.querySelectorAll("[data-terminal-new-back]").forEach((button) => bindPtyClick(button, () => {
    terminalAdvancedNewOpen = false;
    terminalProjectMenuTarget = "";
    renderTopbar();
    bindPtyTopbarControls();
  }));
  document.querySelectorAll("[data-terminal-simple-agent]").forEach((button) => {
    bindPtyClick(button, () => createTerminalForAgent(button.dataset.terminalSimpleAgent));
  });
  document.querySelectorAll("[data-terminal-close-all]").forEach((button) => {
    bindPtyClick(button, () => void requestCloseAllTerminals());
  });
  document.querySelectorAll("[data-terminal-sidebar-toggle]").forEach((button) => {
    bindPtyClick(button, () => {
      if (terminalCompanionMode === "voice" || terminalCompanionMode === "memory") {
        terminalSidebarMode = terminalCompanionMode;
        closeTerminalCompanionPanel();
        return;
      }
      openTerminalCompanionPanel(terminalSidebarMode, "toolbar");
    });
  });
  document.querySelectorAll("[data-terminal-drag]").forEach((tab) => {
    if (tab.dataset.simpleDragBound) return;
    tab.dataset.simpleDragBound = "1";
    bindTerminalDrag(tab);
  });
};

function handleTerminalShortcuts(event) {
  if (activePage !== "terminals" || !(event.ctrlKey || event.metaKey) || event.altKey) return;
  const key = event.key.toLowerCase();
  if (key === "t") {
    event.preventDefault();
    if (terminals.length >= maxTerminals) return;
    newTerminalMenuOpen = true;
    terminalAdvancedNewOpen = false;
    terminalToolbarMenuOpen = false;
    renderTopbar();
    bindPtyTopbarControls();
    return;
  }
  if (key === "w") {
    event.preventDefault();
    if (activeTerminalId) (typeof requestCloseTerminal === "function" ? requestCloseTerminal : closeTerminal)(activeTerminalId);
    return;
  }
  if (event.key !== "Tab" || terminals.length < 2) return;
  event.preventDefault();
  const current = Math.max(0, terminals.findIndex((terminal) => terminal.id === activeTerminalId));
  const delta = event.shiftKey ? -1 : 1;
  setActiveTerminal(terminals[(current + delta + terminals.length) % terminals.length].id);
}

document.addEventListener("keydown", handleTerminalShortcuts);
