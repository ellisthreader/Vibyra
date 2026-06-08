function terminalMemoryHtml() {
  const terminal = terminalCompanionActiveTerminal();
  const projectId = String(terminal?.projectId || "");
  terminalMemoryEnsureProject(projectId);
  return terminalMemoryWorkspaceHtml(terminal);
}

function bindTerminalMemory(root = document) {
  const workspace = root.querySelector?.("[data-terminal-memory-workspace]") || root;
  bindTerminalMemoryEvents(workspace);
}

function terminalMemoryEnsureProject(projectId) {
  if (!projectId) {
    terminalMemoryReset("");
    return;
  }
  if (terminalMemoryState.projectId === projectId && (terminalMemoryState.loading || terminalMemoryState.loaded)) return;
  terminalMemoryReset(projectId);
  queueMicrotask(() => loadTerminalMemoryVault(projectId));
}

function terminalMemoryRefresh(options = {}) {
  const panel = document.querySelector("[data-terminal-memory-panel]");
  if (!panel) return;
  const terminal = terminalCompanionActiveTerminal();
  const active = document.activeElement;
  const preserveEditor = options.preserveEditor && panel.contains(active);
  if (preserveEditor) {
    terminalMemoryUpdateStatus();
    terminalMemoryUpdateTree();
    return;
  }
  panel.innerHTML = terminalMemoryWorkspaceHtml(terminal);
  bindTerminalMemory(panel);
}

function terminalMemoryUpdateStatus() {
  const status = document.querySelector("[data-terminal-memory-status]");
  if (status) status.textContent = terminalMemoryState.status || "";
}

function terminalMemoryUpdateTree() {
  const tree = document.querySelector("[data-terminal-memory-tree]");
  if (!tree) return;
  tree.innerHTML = terminalMemoryTreeHtml();
  bindTerminalMemoryTreeEvents(tree);
}

function terminalProjectName(terminal) {
  return projectForTerminal(terminal)?.name || terminal?.projectId || "";
}
