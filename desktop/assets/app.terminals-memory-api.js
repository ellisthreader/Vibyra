function retryTerminalMemoryVault() {
  const projectId = terminalMemoryState.projectId;
  if (!projectId) return;
  if (terminalMemoryState.loading) {
    terminalMemoryState.reloadQueued = true;
    return;
  }
  terminalMemoryState.loadFailed = false;
  terminalMemoryState.loaded = false;
  void loadTerminalMemoryVault(projectId, true);
}

window.addEventListener?.("vibyra:desktop-session-ready", retryTerminalMemoryVault);
window.addEventListener?.("online", () => {
  if (terminalMemoryState.loadFailed) retryTerminalMemoryVault();
});

async function terminalMemoryRequest(url, options = {}) {
  const response = await fetch(url, {
    cache: "no-store",
    ...options,
    headers: {
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {})
    }
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || result.ok === false) {
    throw new Error(result.error || result.message || "Vibyra Memory request failed.");
  }
  return result;
}

async function loadTerminalMemoryVault(projectId, force = false) {
  if (!projectId) return;
  if (terminalMemoryState.loading) {
    if (force) terminalMemoryState.reloadQueued = true;
    return;
  }
  if (!force && terminalMemoryState.loaded && terminalMemoryState.projectId === projectId) return;
  terminalMemoryState.loading = true;
  terminalMemoryState.loadFailed = false;
  terminalMemoryState.status = "Loading memory...";
  terminalMemoryRefresh();
  try {
    const result = await terminalMemoryRequest(`/desktop/project-memory/vault?projectId=${encodeURIComponent(projectId)}`);
    if (terminalMemoryState.projectId !== projectId) return;
    terminalMemoryState.nodes = terminalMemoryNormalizeVault(result.vault || result.memory || result);
    terminalMemoryTouchGraph();
    terminalMemoryState.loaded = true;
    terminalMemoryState.loadFailed = false;
    terminalMemoryState.status = "";
    const preferred = terminalMemoryState.nodes.find((node) => node.id === result.selectedId)
      || terminalMemoryState.nodes.find((node) => node.type === "document");
    terminalMemorySelect(preferred?.id || "");
  } catch (error) {
    terminalMemoryState.loaded = false;
    terminalMemoryState.loadFailed = true;
    terminalMemoryState.status = terminalMemoryError(error, "Project memory could not load.");
  } finally {
    terminalMemoryState.loading = false;
    terminalMemoryRefresh();
    if (terminalMemoryState.reloadQueued && terminalMemoryState.projectId === projectId) {
      terminalMemoryState.reloadQueued = false;
      queueMicrotask(() => loadTerminalMemoryVault(projectId, true));
    }
  }
}

async function saveTerminalMemoryNode() {
  const node = terminalMemorySelectedNode();
  if (!node || node.type !== "document" || !terminalMemoryState.dirty || terminalMemoryState.saving) return;
  terminalMemoryState.saving = true;
  terminalMemoryState.status = "Saving...";
  terminalMemoryUpdateStatus();
  try {
    const query = `projectId=${encodeURIComponent(terminalMemoryState.projectId)}&nodeId=${encodeURIComponent(node.id)}`;
    const result = await terminalMemoryRequest(`/desktop/project-memory/node?${query}`, {
      method: "PATCH",
      body: JSON.stringify({
        name: terminalMemoryState.draftTitle.trim() || "Untitled",
        markdownContent: terminalMemoryState.draftBody,
        version: node.version
      })
    });
    terminalMemoryReplaceNode(result.node || result.memoryNode || {
      ...node,
      name: terminalMemoryState.draftTitle.trim() || "Untitled",
      body: terminalMemoryState.draftBody,
      version: node.version + 1
    });
    terminalMemoryState.dirty = false;
    terminalMemoryState.status = "Saved";
    terminalMemoryUpdateTree();
  } catch (error) {
    terminalMemoryState.status = terminalMemoryError(error, "Note could not be saved.");
  } finally {
    terminalMemoryState.saving = false;
    terminalMemoryUpdateStatus();
  }
}

async function deleteTerminalMemoryNode(nodeId) {
  const node = terminalMemoryState.nodes.find((item) => item.id === nodeId);
  if (!node) return;
  const descendants = terminalMemoryDescendantIds(node.id);
  if (!window.confirm(`Delete "${node.name}"${descendants.length ? " and everything inside it" : ""}?`)) return;
  terminalMemoryState.status = "Deleting...";
  terminalMemoryUpdateStatus();
  try {
    const recursive = descendants.length ? "&recursive=1" : "";
    const query = `projectId=${encodeURIComponent(terminalMemoryState.projectId)}&nodeId=${encodeURIComponent(node.id)}${recursive}`;
    await terminalMemoryRequest(`/desktop/project-memory/node?${query}`, {
      method: "DELETE"
    });
    const removed = new Set([node.id, ...descendants]);
    terminalMemoryState.nodes = terminalMemoryState.nodes.filter((item) => !removed.has(item.id));
    terminalMemoryTouchGraph();
    terminalMemorySelect(terminalMemoryState.nodes.find((item) => item.type === "document")?.id || "");
    terminalMemoryState.status = "Deleted";
    terminalMemoryRefresh();
  } catch (error) {
    terminalMemoryState.status = terminalMemoryError(error, "Memory item could not be deleted.");
    terminalMemoryUpdateStatus();
  }
}

function terminalMemoryDescendantIds(nodeId) {
  const found = [];
  const visit = (parentId) => terminalMemoryChildren(parentId).forEach((node) => {
    found.push(node.id);
    visit(node.id);
  });
  visit(nodeId);
  return found;
}

function terminalMemoryError(error, fallback) {
  return error instanceof Error ? error.message : fallback;
}
