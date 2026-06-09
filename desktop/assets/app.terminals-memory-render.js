function terminalMemoryWorkspaceHtml(terminal) {
  const projectId = String(terminal?.projectId || "");
  const projectName = terminalProjectName(terminal) || "No project selected";
  const selected = terminalMemorySelectedNode();
  const isDocument = selected?.type === "document";
  const mode = terminalMemoryState.mode;
  return `<div class="terminal-memory-workspace" data-terminal-memory-workspace>
    <header class="terminal-memory-toolbar">
      <div class="terminal-memory-heading">
        <strong>${icon("archive")}<span>Project memory</span></strong>
        <small title="${escapeAttribute(projectName)}">${escapeHtml(projectName)} · available to Vibyra AI</small>
      </div>
      <div class="terminal-memory-toolbar-actions">
        <button type="button" data-terminal-memory-new-note title="New note" ${projectId ? "" : "disabled"}>${icon("document")}</button>
        <button type="button" data-terminal-memory-new-folder title="New folder" ${projectId ? "" : "disabled"}>${icon("folder")}</button>
        <button type="button" data-terminal-memory-import-files title="Import Markdown" ${projectId ? "" : "disabled"}>${icon("share")}</button>
        <button type="button" data-terminal-memory-import-vault title="Import Obsidian vault" ${projectId ? "" : "disabled"}>${icon("archive")}</button>
      </div>
    </header>
    <input class="terminal-memory-hidden-input" type="file" accept=".md,text/markdown" multiple data-terminal-memory-file-input>
    <input class="terminal-memory-hidden-input" type="file" accept=".md,text/markdown" multiple webkitdirectory directory data-terminal-memory-vault-input>
    <div class="terminal-memory-workbench">
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
    </div>
    <footer class="terminal-memory-footer">
      <span data-terminal-memory-status aria-live="polite">${escapeHtml(terminalMemoryState.status)}</span>
      <span>${terminalMemoryState.nodes.filter((node) => node.type === "document").length} note${terminalMemoryState.nodes.filter((node) => node.type === "document").length === 1 ? "" : "s"}</span>
    </footer>
  </div>`;
}

function terminalMemoryTreeHtml() {
  if (terminalMemoryState.loading) return '<p class="terminal-memory-empty">Loading memory...</p>';
  if (!terminalMemoryState.projectId) return '<p class="terminal-memory-empty">Choose a terminal project.</p>';
  const visible = terminalMemoryVisibleNodes();
  if (!visible.length) {
    return `<p class="terminal-memory-empty">${terminalMemoryState.query ? "No matching notes." : "Create or import your first note."}</p>`;
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
    </div>
    <div class="terminal-memory-document-actions">
      <button type="button" data-terminal-memory-insert>${icon("terminal")}<span>Insert into terminal</span></button>
      <button type="button" class="danger" data-terminal-memory-delete="${escapeAttribute(node.id)}">${icon("trash")}<span>Delete</span></button>
    </div>`;
}

function terminalMemoryEmptyDocumentHtml(projectId) {
  return `<div class="terminal-memory-document-empty">
    ${icon("archive")}
    <strong>${projectId ? "Open a note" : "Project memory"}</strong>
    <p>${projectId ? "Select a note, create one, or import Markdown." : "Choose a project-backed terminal to begin."}</p>
  </div>`;
}
