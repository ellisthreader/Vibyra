function terminalEditorHtml(terminal) {
  const active = activeTerminalEditorTab();
  const terminalId = terminal?.id || activeTerminalId || active?.terminalId;
  const workspace = terminalEditorWorkspaces[terminalId] || null;
  return `<div class="terminal-editor-workbench" data-terminal-editor>
    <aside class="terminal-editor-explorer">
      <header class="terminal-editor-directory" title="${escapeAttribute(workspace?.root || "")}"><span>${icon("folder")}<strong>${escapeHtml(workspace?.root || "Project files")}</strong></span></header>
      <nav class="terminal-editor-file-tree" aria-label="Workspace files">${terminalEditorFileTreeHtml(workspace, terminalId)}</nav>
    </aside>
    <section class="terminal-editor-main">${terminalEditorTabsHtml()}${active ? terminalEditorFileHtml(active) : terminalEditorEmptyHtml()}</section>
  </div>`;
}
function terminalEditorFileTreeHtml(workspace, terminalId) {
  const files = workspace?.files || [];
  if (workspace?.loading) return `<div class="terminal-editor-files-empty terminal-editor-files-loading">${icon("refresh")}<span>Loading project files...</span></div>`;
  if (workspace?.error) return `<div class="terminal-editor-files-empty terminal-editor-files-error">${icon("alert")}<span>${escapeHtml(workspace.error)}</span><button type="button" data-terminal-editor-refresh>Retry</button></div>`;
  if (!files.length) return `<div class="terminal-editor-files-empty">${icon("folder")}<span>No project files were found in this terminal workspace.</span></div>`;
  const tree = {};
  files.forEach((file) => {
    const parts = String(file.path || "").split("/").filter(Boolean);
    let node = tree;
    parts.forEach((part, index) => {
      if (index === parts.length - 1) node[part] = { __file: file };
      else node = node[part] ||= {};
    });
  });
  return terminalEditorTreeNodeHtml(tree, terminalId);
}
function terminalEditorTreeNodeHtml(node, terminalId, prefix = "") {
  return Object.entries(node).map(([name, value]) => {
    const path = prefix ? `${prefix}/${name}` : name;
    if (value.__file) {
      const active = activeTerminalEditorTab()?.key === terminalEditorKey(terminalId, path);
      const disabled = value.__file.openable === false ? " terminal-editor-file--binary" : "";
      return `<button class="terminal-editor-file ${active ? "active" : ""}${disabled}" type="button" data-terminal-editor-file="${escapeAttribute(path)}" data-terminal-editor-id="${escapeAttribute(terminalId)}" title="${escapeAttribute(path)}"><span class="terminal-editor-file-icon">${terminalEditorFileIcon(name)}</span><span>${escapeHtml(name)}</span></button>`;
    }
    return `<details class="terminal-editor-folder"><summary>${icon("chevron")}<span>${escapeHtml(name)}</span></summary><div>${terminalEditorTreeNodeHtml(value, terminalId, path)}</div></details>`;
  }).join("");
}
function terminalEditorFileIcon(name) {
  const extension = String(name).split(".").pop()?.toLowerCase();
  const label = { css: "#", html: "<>", js: "JS", jsx: "JS", json: "{}", md: "M", mjs: "JS", php: "PHP", py: "PY", ts: "TS", tsx: "TS", vue: "V" }[extension] || "·";
  return `<i class="terminal-editor-file-type terminal-editor-file-type--${escapeAttribute(extension || "file")}">${escapeHtml(label)}</i>`;
}
function terminalEditorTabsHtml() {
  return `<header class="terminal-editor-tabs" role="tablist" aria-label="Open files">${terminalEditorTabs.map((tab) => {
    const active = tab.key === terminalEditorActiveKey;
    return `<div class="terminal-editor-tab ${active ? "active" : ""}" role="tab" aria-selected="${active}"><button type="button" data-terminal-editor-tab="${escapeAttribute(tab.key)}" title="${escapeAttribute(tab.path)}">${terminalEditorFileIcon(tab.name)}<span>${escapeHtml(tab.name)}</span><i class="terminal-editor-dirty ${terminalEditorDirty(tab) ? "visible" : ""}" data-terminal-editor-tab-dirty="${escapeAttribute(tab.key)}"></i></button><button type="button" data-terminal-editor-close="${escapeAttribute(tab.key)}" aria-label="Close ${escapeAttribute(tab.name)}">${icon("close")}</button></div>`;
  }).join("")}</header>`;
}
function terminalEditorFileHtml(tab) {
  if (tab.loading) return `<div class="terminal-editor-state">${icon("refresh")}<strong>Opening ${escapeHtml(tab.name)}</strong></div>`;
  if (tab.error && !tab.content) return `<div class="terminal-editor-state terminal-editor-state--error">${icon("alert")}<strong>${escapeHtml(tab.error)}</strong></div>`;
  const changed = terminalEditorChangedLines(tab);
  return `<div class="terminal-editor-file-view">
    <header class="terminal-editor-toolbar"><div><span>${escapeHtml(tab.path)}</span><small data-terminal-editor-change-status>${terminalEditorDirty(tab) ? `${changed.size} changed line${changed.size === 1 ? "" : "s"}` : "Saved"}</small></div><div><button type="button" data-terminal-editor-revert ${terminalEditorDirty(tab) ? "" : "disabled"}>${icon("refresh")}<span>Revert</span></button><button class="terminal-editor-save" type="button" data-terminal-editor-save ${terminalEditorDirty(tab) && !tab.saving ? "" : "disabled"}>${icon("check")}<span>${tab.saving ? "Saving..." : "Save"}</span></button></div></header>
    <div class="terminal-editor-alert-slot">${tab.error ? `<div class="terminal-editor-alert">${icon("alert")}<span>${escapeHtml(tab.error)}</span>${tab.diskChanged ? '<button type="button" data-terminal-editor-reload>Reload from disk</button>' : ""}</div>` : ""}</div>
    <div class="terminal-editor-code"><div class="terminal-editor-monaco" data-terminal-editor-input aria-label="Editing ${escapeAttribute(tab.path)}"><div class="terminal-editor-monaco-loading">${icon("refresh")}<span>Loading editor...</span></div></div></div>
    <footer class="terminal-editor-statusbar"><span data-terminal-editor-position>Ln ${tab.line || 1}, Col ${tab.column || 1}</span><span>Spaces: 2</span><span>UTF-8</span><span>${escapeHtml(tab.language || "text")}</span></footer>
  </div>`;
}
function terminalEditorGutterHtml(lineCount, changed = new Set()) {
  return Array.from({ length: Math.min(Math.max(1, lineCount), 12000) }, (_, index) => `<span class="${changed.has(index + 1) ? "changed" : ""}">${index + 1}</span>`).join("");
}
function terminalEditorEmptyHtml() {
  return `<div class="terminal-editor-empty"><span>${icon("code")}</span><strong>Vibyra Editor</strong><p>Click a file path in any terminal to inspect and edit it without leaving your session.</p><kbd>Ctrl S</kbd><small>to save</small></div>`;
}
