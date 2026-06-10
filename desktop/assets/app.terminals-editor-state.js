const terminalEditorTabs = [];
const terminalEditorWorkspaces = {};
const terminalEditorWorkspaceRequests = {};
let terminalEditorActiveKey = "";

function terminalEditorKey(terminalId, path) {
  return `${terminalId}:${String(path || "").replace(/\\/g, "/")}`;
}
function activeTerminalEditorTab() {
  return terminalEditorTabs.find((tab) => tab.key === terminalEditorActiveKey) || null;
}
function terminalEditorTab(terminalId, path) {
  return terminalEditorTabs.find((tab) => tab.key === terminalEditorKey(terminalId, path)) || null;
}
function terminalEditorDirty(tab) {
  return Boolean(tab && tab.content !== tab.savedContent);
}
function terminalEditorChangedLines(tab) {
  const saved = String(tab?.savedContent || "").split("\n");
  const current = String(tab?.content || "").split("\n");
  const changed = new Set();
  for (let index = 0; index < Math.max(saved.length, current.length); index += 1) {
    if (saved[index] !== current[index]) changed.add(index + 1);
  }
  return changed;
}
function normalizeTerminalEditorPath(value) {
  return String(value || "").trim().replace(/^@/, "").replace(/^file:\/\//, "").replace(/[),.;]+$/, "");
}
function terminalEditorApi(terminalId, action, path = "") {
  const base = `/desktop/terminal-editor/${encodeURIComponent(terminalId)}/${action}`;
  return path ? `${base}?path=${encodeURIComponent(path)}` : base;
}
async function loadTerminalEditorWorkspace(terminalId, force = false) {
  if (!terminalId || (terminalEditorWorkspaces[terminalId]?.loaded && !force)) {
    return terminalEditorWorkspaces[terminalId] || null;
  }
  if (terminalEditorWorkspaceRequests[terminalId] && !force) {
    return terminalEditorWorkspaceRequests[terminalId];
  }
  terminalEditorWorkspaces[terminalId] = {
    ...(terminalEditorWorkspaces[terminalId] || {}),
    loading: true,
    error: ""
  };
  const request = (async () => {
    try {
      const response = await fetch(terminalEditorApi(terminalId, "files"));
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "The workspace files could not be loaded.");
      terminalEditorWorkspaces[terminalId] = {
        ...(result.workspace || {}),
        files: Array.isArray(result.files) ? result.files : [],
        loaded: true,
        loading: false,
        error: ""
      };
      return terminalEditorWorkspaces[terminalId];
    } catch (error) {
      terminalEditorWorkspaces[terminalId] = {
        ...(terminalEditorWorkspaces[terminalId] || {}),
        files: [],
        loaded: false,
        loading: false,
        error: error instanceof Error ? error.message : "The workspace files could not be loaded."
      };
      throw error;
    } finally {
      delete terminalEditorWorkspaceRequests[terminalId];
    }
  })();
  terminalEditorWorkspaceRequests[terminalId] = request;
  return request;
}
async function loadTerminalEditorFile(terminalId, path, line = 1, column = 1) {
  const normalizedPath = normalizeTerminalEditorPath(path);
  if (!terminalId || !normalizedPath) return null;
  let tab = terminalEditorTab(terminalId, normalizedPath);
  if (!tab) {
    tab = {
      key: terminalEditorKey(terminalId, normalizedPath), terminalId, path: normalizedPath,
      name: normalizedPath.split("/").pop() || normalizedPath, language: "text",
      content: "", savedContent: "", revision: "", line, column, loading: true,
      saving: false, error: "", diskChanged: false
    };
    terminalEditorTabs.push(tab);
  } else {
    tab.line = line || tab.line;
    tab.column = column || tab.column;
    tab.loading = true;
    tab.error = "";
  }
  terminalEditorActiveKey = tab.key;
  syncTerminalCompanion("editor-loading");
  try {
    const url = `${terminalEditorApi(terminalId, "file", normalizedPath)}&line=${line || 1}&column=${column || 1}`;
    const response = await fetch(url);
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.file) throw new Error(result.error || "The file could not be opened.");
    const canonicalKey = terminalEditorKey(terminalId, result.file.path);
    const duplicate = terminalEditorTabs.find((item) => item !== tab && item.key === canonicalKey);
    if (duplicate) {
      terminalEditorTabs.splice(terminalEditorTabs.indexOf(duplicate), 1);
    }
    Object.assign(tab, result.file, {
      key: canonicalKey,
      savedContent: result.file.content, loading: false, error: "", diskChanged: false
    });
    terminalEditorActiveKey = canonicalKey;
    if (result.workspace) {
      terminalEditorWorkspaces[terminalId] = { ...(terminalEditorWorkspaces[terminalId] || {}), ...result.workspace };
    }
    void loadTerminalEditorWorkspace(terminalId).catch(() => {});
  } catch (error) {
    tab.loading = false;
    tab.error = error instanceof Error ? error.message : "The file could not be opened.";
  }
  syncTerminalCompanion("editor-loaded");
  requestAnimationFrame(() => focusTerminalEditorLocation(tab));
  return tab;
}
async function saveTerminalEditorTab(tab = activeTerminalEditorTab()) {
  if (!tab || tab.saving || !terminalEditorDirty(tab)) return;
  const cursor = { line: tab.line, column: tab.column };
  tab.saving = true;
  tab.error = "";
  refreshTerminalEditorChrome();
  try {
    const response = await fetch(terminalEditorApi(tab.terminalId, "file"), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: tab.path, content: tab.content, baseRevision: tab.revision })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.file) {
      if (response.status === 409) tab.diskChanged = true;
      throw new Error(result.error || "The file could not be saved.");
    }
    Object.assign(tab, result.file, {
      savedContent: result.file.content, saving: false, error: "", diskChanged: false,
      line: cursor.line, column: cursor.column
    });
  } catch (error) {
    tab.saving = false;
    tab.error = error instanceof Error ? error.message : "The file could not be saved.";
  }
  refreshTerminalEditor();
}
function revertTerminalEditorTab(tab = activeTerminalEditorTab()) {
  if (!tab) return;
  tab.content = tab.savedContent;
  tab.error = "";
  tab.diskChanged = false;
  refreshTerminalEditor();
}
function closeTerminalEditorTab(key) {
  const index = terminalEditorTabs.findIndex((tab) => tab.key === key);
  if (index < 0) return;
  if (terminalEditorDirty(terminalEditorTabs[index]) && !window.confirm(`Close ${terminalEditorTabs[index].name} without saving?`)) return;
  if (typeof terminalEditorDisposeModel === "function") terminalEditorDisposeModel(key);
  terminalEditorTabs.splice(index, 1);
  if (terminalEditorActiveKey === key) {
    terminalEditorActiveKey = terminalEditorTabs[index]?.key || terminalEditorTabs[index - 1]?.key || "";
  }
  refreshTerminalEditor();
}
