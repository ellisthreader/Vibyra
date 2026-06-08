function bindTerminalMemoryEvents(root) {
  if (!root || root.dataset.terminalMemoryBound) return;
  root.dataset.terminalMemoryBound = "1";
  bindTerminalMemoryTreeEvents(root);
  root.querySelector("[data-terminal-memory-search]")?.addEventListener("input", (event) => {
    terminalMemoryState.query = event.target.value;
    terminalMemoryUpdateTree();
  });
  root.querySelector("[data-terminal-memory-title]")?.addEventListener("input", (event) => {
    terminalMemoryState.draftTitle = event.target.value;
    scheduleTerminalMemorySave();
  });
  root.querySelector("[data-terminal-memory-body]")?.addEventListener("input", (event) => {
    terminalMemoryState.draftBody = event.target.value;
    const preview = root.querySelector("[data-terminal-memory-preview]");
    if (preview) preview.innerHTML = terminalMemoryMarkdownHtml(event.target.value);
    scheduleTerminalMemorySave();
  });
  if (typeof bindTerminalMemoryNativePickers === "function") bindTerminalMemoryNativePickers(root);
  if (typeof bindTerminalMemoryFullscreenButtons === "function") bindTerminalMemoryFullscreenButtons(root);
  root.querySelector("[data-terminal-memory-vault-input]")?.addEventListener("change", (event) => {
    consumeTerminalMemoryImport(event, "vault");
  });
  root.querySelectorAll("[data-terminal-memory-view]").forEach((button) => button.addEventListener("click", () => {
    terminalMemoryState.view = button.dataset.terminalMemoryView === "notes" ? "notes" : "graph";
    terminalMemoryRefresh();
  }));
  root.querySelectorAll("[data-terminal-memory-mode]").forEach((button) => button.addEventListener("click", () => {
    terminalMemoryState.mode = button.dataset.terminalMemoryMode === "preview" ? "preview" : "edit";
    terminalMemoryRefresh();
  }));
  if (typeof bindTerminalMemoryOnboardingEvents === "function") bindTerminalMemoryOnboardingEvents(root);
  if (typeof bindTerminalMemoryGraphEvents === "function") bindTerminalMemoryGraphEvents(root);
  if (typeof bindTerminalMemoryFullscreen === "function") bindTerminalMemoryFullscreen(root);
  root.addEventListener("keydown", handleTerminalMemoryKeyboard);
}

function bindTerminalMemoryTreeEvents(root) {
  root.querySelectorAll("[data-terminal-memory-node]").forEach((row) => {
    if (row.dataset.terminalMemoryRowBound) return;
    row.dataset.terminalMemoryRowBound = "1";
    row.addEventListener("click", (event) => {
      if (event.target.closest("button")) return;
      void selectTerminalMemoryNode(row.dataset.terminalMemoryNode);
    });
    row.addEventListener("dblclick", () => toggleTerminalMemoryFolder(row.dataset.terminalMemoryNode));
  });
  root.querySelectorAll("[data-terminal-memory-toggle]").forEach((button) => {
    if (button.dataset.terminalMemoryToggleBound) return;
    button.dataset.terminalMemoryToggleBound = "1";
    button.addEventListener("click", () => toggleTerminalMemoryFolder(button.dataset.terminalMemoryToggle));
  });
  root.querySelectorAll("[data-terminal-memory-delete]").forEach((button) => {
    if (button.dataset.terminalMemoryDeleteBound) return;
    button.dataset.terminalMemoryDeleteBound = "1";
    button.addEventListener("click", () => void deleteTerminalMemoryNode(button.dataset.terminalMemoryDelete));
  });
}

async function selectTerminalMemoryNode(nodeId) {
  if (nodeId === terminalMemoryState.selectedId) return;
  await flushTerminalMemorySave();
  const node = terminalMemoryState.nodes.find((item) => item.id === nodeId);
  if (!node) return;
  if (node.type === "folder") {
    terminalMemoryState.expandedIds.add(node.id);
  }
  terminalMemorySelect(node.id);
  terminalMemoryRefresh();
}

function toggleTerminalMemoryFolder(nodeId) {
  const node = terminalMemoryState.nodes.find((item) => item.id === nodeId);
  if (node?.type !== "folder") return;
  if (terminalMemoryState.expandedIds.has(nodeId)) terminalMemoryState.expandedIds.delete(nodeId);
  else terminalMemoryState.expandedIds.add(nodeId);
  terminalMemoryUpdateTree();
}

function scheduleTerminalMemorySave() {
  terminalMemoryState.dirty = true;
  terminalMemoryState.status = "Unsaved";
  terminalMemoryUpdateStatus();
  window.clearTimeout(terminalMemoryState.saveTimer);
  terminalMemoryState.saveTimer = window.setTimeout(() => void saveTerminalMemoryNode(), 700);
}

async function flushTerminalMemorySave() {
  window.clearTimeout(terminalMemoryState.saveTimer);
  terminalMemoryState.saveTimer = 0;
  await saveTerminalMemoryNode();
}

function handleTerminalMemoryKeyboard(event) {
  const command = event.ctrlKey || event.metaKey;
  if (command && event.key.toLowerCase() === "s") {
    event.preventDefault();
    void flushTerminalMemorySave();
  } else if (command && event.key.toLowerCase() === "e") {
    event.preventDefault();
    terminalMemoryState.mode = terminalMemoryState.mode === "edit" ? "preview" : "edit";
    terminalMemoryRefresh();
  } else if (command && event.shiftKey && event.key.toLowerCase() === "f") {
    event.preventDefault();
    document.querySelector("[data-terminal-memory-search]")?.focus();
  } else if (event.key === "Delete" && document.activeElement?.matches?.("[data-terminal-memory-node]")) {
    event.preventDefault();
    void deleteTerminalMemoryNode(document.activeElement.dataset.terminalMemoryNode);
  } else if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
    handleTerminalMemoryTreeArrow(event);
  }
}

function handleTerminalMemoryTreeArrow(event) {
  const row = event.target.closest?.("[data-terminal-memory-node]");
  if (!row) return;
  const node = terminalMemoryState.nodes.find((item) => item.id === row.dataset.terminalMemoryNode);
  if (node?.type !== "folder") return;
  const expanded = terminalMemoryState.expandedIds.has(node.id);
  if (event.key === "ArrowRight" && !expanded) toggleTerminalMemoryFolder(node.id);
  if (event.key === "ArrowLeft" && expanded) toggleTerminalMemoryFolder(node.id);
}
