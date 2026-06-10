const terminalMemoryState = {
  projectId: "",
  nodes: [],
  selectedId: "",
  query: "",
  expandedIds: new Set(),
  mode: "edit",
  view: "graph",
  loading: false,
  loaded: false,
  reloadQueued: false,
  saving: false,
  dirty: false,
  status: "",
  saveTimer: 0,
  draftTitle: "",
  draftBody: "",
  discoveryStatus: "idle",
  discoveredVaults: [],
  discoveryError: "",
  graphScale: 1,
  graphPanX: 0,
  graphPanY: 0
};

function terminalMemoryReset(projectId = "") {
  window.clearTimeout(terminalMemoryState.saveTimer);
  terminalMemoryState.projectId = String(projectId || "");
  terminalMemoryState.nodes = [];
  terminalMemoryState.selectedId = "";
  terminalMemoryState.query = "";
  terminalMemoryState.expandedIds = new Set();
  terminalMemoryState.mode = "edit";
  terminalMemoryState.view = "graph";
  terminalMemoryState.loading = false;
  terminalMemoryState.loaded = false;
  terminalMemoryState.reloadQueued = false;
  terminalMemoryState.saving = false;
  terminalMemoryState.dirty = false;
  terminalMemoryState.status = "";
  terminalMemoryState.draftTitle = "";
  terminalMemoryState.draftBody = "";
  terminalMemoryState.discoveryStatus = "idle";
  terminalMemoryState.discoveredVaults = [];
  terminalMemoryState.discoveryError = "";
  terminalMemoryState.graphScale = 1;
  terminalMemoryState.graphPanX = 0;
  terminalMemoryState.graphPanY = 0;
}

function terminalMemoryNormalizeVault(value) {
  const source = Array.isArray(value) ? value : value?.nodes;
  const nodes = Array.isArray(source) ? source.map(terminalMemoryNormalizeNode).filter(Boolean) : [];
  nodes.sort((left, right) => {
    if (left.parentId !== right.parentId) return left.parentId.localeCompare(right.parentId);
    if (left.type !== right.type) return left.type === "folder" ? -1 : 1;
    return left.name.localeCompare(right.name, undefined, { sensitivity: "base" });
  });
  return nodes;
}

function terminalMemoryNormalizeNode(value) {
  const id = String(value?.id || value?.nodeId || "");
  if (!id) return null;
  const rawType = String(value?.type || value?.kind || "document").toLowerCase();
  const type = rawType === "folder" ? "folder" : "document";
  const name = String(value?.name || value?.title || (type === "folder" ? "Untitled folder" : "Untitled")).trim();
  return {
    id,
    parentId: String(value?.parentId || value?.parent_id || ""),
    type,
    name: name || (type === "folder" ? "Untitled folder" : "Untitled"),
    body: String(value?.markdown ?? value?.markdownContent ?? value?.markdown_content ?? value?.body ?? value?.content ?? ""),
    sourcePath: String(value?.sourcePath || value?.source_path || ""),
    version: Number(value?.version || 0),
    updatedAt: String(value?.updatedAt || value?.updated_at || "")
  };
}

function terminalMemorySelectedNode() {
  return terminalMemoryState.nodes.find((node) => node.id === terminalMemoryState.selectedId) || null;
}

function terminalMemorySelect(nodeId) {
  const node = terminalMemoryState.nodes.find((item) => item.id === nodeId) || null;
  terminalMemoryState.selectedId = node?.id || "";
  terminalMemoryState.draftTitle = node?.name || "";
  terminalMemoryState.draftBody = node?.type === "document" ? node.body : "";
  terminalMemoryState.dirty = false;
  terminalMemoryState.status = node?.type === "document" ? "Saved" : "";
  if (node) terminalMemoryExpandAncestors(node);
}

function terminalMemoryExpandAncestors(node) {
  let parentId = node.parentId;
  while (parentId) {
    terminalMemoryState.expandedIds.add(parentId);
    parentId = terminalMemoryState.nodes.find((item) => item.id === parentId)?.parentId || "";
  }
}

function terminalMemoryChildren(parentId = "") {
  return terminalMemoryState.nodes.filter((node) => node.parentId === parentId);
}

function terminalMemoryVisibleNodes() {
  const query = terminalMemoryState.query.trim().toLowerCase();
  if (!query) return terminalMemoryState.nodes;
  const matches = new Set();
  terminalMemoryState.nodes.forEach((node) => {
    if (`${node.name}\n${node.body}`.toLowerCase().includes(query)) {
      matches.add(node.id);
      let parentId = node.parentId;
      while (parentId) {
        matches.add(parentId);
        parentId = terminalMemoryState.nodes.find((item) => item.id === parentId)?.parentId || "";
      }
    }
  });
  return terminalMemoryState.nodes.filter((node) => matches.has(node.id));
}

function terminalMemoryReplaceNode(value) {
  const node = terminalMemoryNormalizeNode(value);
  if (!node) return null;
  const index = terminalMemoryState.nodes.findIndex((item) => item.id === node.id);
  if (index >= 0) terminalMemoryState.nodes.splice(index, 1, node);
  else terminalMemoryState.nodes.push(node);
  return node;
}
