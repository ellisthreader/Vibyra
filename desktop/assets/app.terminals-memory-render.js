function terminalMemoryWorkspaceHtml(terminal) {
  const projectId = String(terminal?.projectId || "");
  const projectName = terminalProjectName(terminal) || "No project selected";
  const selected = terminalMemorySelectedNode();
  const isDocument = selected?.type === "document";
  const mode = terminalMemoryState.mode;
  if (typeof terminalMemoryIsFullscreen === "function"
    && terminalMemoryIsFullscreen()
    && typeof terminalMemoryFullscreenHtml === "function") {
    return terminalMemoryFullscreenHtml(terminal);
  }
  const onboarding = Boolean(projectId) && (!terminalMemoryState.loaded || !terminalMemoryState.nodes.length);
  if (onboarding) {
    return `<div class="terminal-memory-workspace terminal-memory-workspace--onboarding" data-terminal-memory-workspace>
      ${terminalMemoryOnboardingHtml()}
    </div>`;
  }
  return `<div class="terminal-memory-workspace" data-terminal-memory-workspace>
    <header class="terminal-memory-toolbar">
      <div class="terminal-memory-heading">
        <strong>Memory</strong>
        <small title="${escapeAttribute(projectName)}">${escapeHtml(projectName)}</small>
      </div>
      <div class="terminal-memory-toolbar-actions">
        <span class="terminal-memory-toolbar-status" data-terminal-memory-status aria-live="polite">${escapeHtml(terminalMemoryState.status)}</span>
        <div class="terminal-memory-view-toggle" aria-label="Memory view">
          <button class="${terminalMemoryState.view === "graph" ? "active" : ""}" type="button" data-terminal-memory-view="graph" title="Graph view">${icon("network")}</button>
          <button class="${terminalMemoryState.view === "notes" ? "active" : ""}" type="button" data-terminal-memory-view="notes" title="Notes view">${icon("document")}</button>
        </div>
        <button type="button" data-terminal-memory-fullscreen aria-label="Open Memory workspace" aria-pressed="false" title="Open Memory workspace">${icon("square")}</button>
        ${terminalMemoryImportMenuHtml()}
        <button type="button" data-terminal-companion-close aria-label="Close Memory">${icon("close")}</button>
      </div>
    </header>
    ${terminalMemoryContentHtml(projectId, isDocument, selected, mode)}
  </div>`;
}

function terminalMemoryContentHtml(projectId, isDocument, selected, mode) {
  if (!projectId) return `<div class="terminal-memory-full-state">${terminalMemoryEmptyDocumentHtml("")}</div>`;
  if (terminalMemoryState.view === "graph" && typeof terminalMemoryGraphHtml === "function") {
    return terminalMemoryGraphHtml();
  }
  return `<div class="terminal-memory-workbench">
      <nav class="terminal-memory-explorer" aria-label="Memory explorer">
        <label class="terminal-memory-search">
          ${icon("search")}
          <input type="search" value="${escapeAttribute(terminalMemoryState.query)}" placeholder="Search notes" aria-label="Search memory" data-terminal-memory-search>
        </label>
        <div class="terminal-memory-tree" role="tree" aria-label="Project memory" data-terminal-memory-tree>
          ${terminalMemoryTreeHtml()}
        </div>
      </nav>
      <main class="terminal-memory-document">
        ${isDocument ? terminalMemoryDocumentHtml(selected, mode) : terminalMemoryEmptyDocumentHtml(projectId)}
      </main>
    </div>`;
}

function terminalMemoryTreeHtml() {
  if (terminalMemoryState.loading) return '<p class="terminal-memory-empty">Loading memory...</p>';
  if (!terminalMemoryState.projectId) return '<p class="terminal-memory-empty">Choose a terminal project.</p>';
  const visible = terminalMemoryVisibleNodes();
  if (!visible.length) {
    return `<p class="terminal-memory-empty">${terminalMemoryState.query ? "No matching notes." : "Import notes to begin."}</p>`;
  }
  const ids = new Set(visible.map((node) => node.id));
  const roots = visible.filter((node) => !node.parentId || !ids.has(node.parentId));
  return roots.map((node) => terminalMemoryTreeNodeHtml(node, 1, ids)).join("");
}

function terminalMemoryTreeNodeHtml(node, level, visibleIds) {
  const children = terminalMemoryChildren(node.id).filter((child) => visibleIds.has(child.id));
  const expanded = terminalMemoryState.query ? true : terminalMemoryState.expandedIds.has(node.id);
  const selected = node.id === terminalMemoryState.selectedId;
  const childHtml = node.type === "folder" && children.length && expanded
    ? `<div role="group">${children.map((child) => terminalMemoryTreeNodeHtml(child, level + 1, visibleIds)).join("")}</div>`
    : "";
  return `<div class="terminal-memory-tree-branch">
    <div class="terminal-memory-tree-row ${selected ? "selected" : ""}" style="--memory-level:${level}" role="treeitem" aria-level="${level}" ${node.type === "folder" ? `aria-expanded="${expanded}"` : ""} aria-selected="${selected}" tabindex="${selected ? "0" : "-1"}" data-terminal-memory-node="${escapeAttribute(node.id)}">
      <button type="button" class="terminal-memory-disclosure" data-terminal-memory-toggle="${escapeAttribute(node.id)}" aria-label="${expanded ? "Collapse" : "Expand"}" ${node.type === "folder" ? "" : "disabled"}>${node.type === "folder" ? icon(expanded ? "chevron-down" : "chevron") : ""}</button>
      <span class="terminal-memory-node-icon">${icon(node.type === "folder" ? "folder" : "document")}</span>
      <span class="terminal-memory-node-name">${escapeHtml(node.name)}</span>
      <button type="button" class="terminal-memory-row-delete" data-terminal-memory-delete="${escapeAttribute(node.id)}" aria-label="Delete ${escapeAttribute(node.name)}">${icon("trash")}</button>
    </div>${childHtml}
  </div>`;
}

function terminalMemoryDocumentHtml(node, mode) {
  const body = terminalMemoryState.draftBody;
  return `<div class="terminal-memory-document-bar">
      <input type="text" value="${escapeAttribute(terminalMemoryState.draftTitle)}" aria-label="Note title" data-terminal-memory-title>
      <div class="terminal-memory-modes" aria-label="Editor mode">
        <button type="button" class="${mode === "edit" ? "active" : ""}" data-terminal-memory-mode="edit">Edit</button>
        <button type="button" class="${mode === "preview" ? "active" : ""}" data-terminal-memory-mode="preview">Preview</button>
      </div>
    </div>
    <div class="terminal-memory-editor ${mode === "preview" ? "preview" : "edit"}">
      <textarea spellcheck="true" aria-label="Markdown note" data-terminal-memory-body>${escapeHtml(body)}</textarea>
      <article class="terminal-memory-preview" data-terminal-memory-preview>${terminalMemoryMarkdownHtml(body)}</article>
    </div>`;
}

function terminalMemoryEmptyDocumentHtml(projectId) {
  return `<div class="terminal-memory-document-empty">
    ${icon("archive")}
    <strong>${projectId ? "Open a note" : "Project memory"}</strong>
    <p>${projectId ? "Select a note, create one, or import Markdown." : "Choose a project-backed terminal to begin."}</p>
  </div>`;
}
