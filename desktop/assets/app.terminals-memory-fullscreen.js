function terminalMemoryFullscreenHtml(terminal) {
  const projectId = String(terminal?.projectId || "");
  const projectName = terminalProjectName(terminal) || "Vibyra Memory";
  const selected = terminalMemorySelectedNode();
  const graphActive = terminalMemoryState.view === "graph";
  const hasVault = terminalMemoryState.loaded && terminalMemoryState.nodes.length;
  const noteLabel = selected?.type === "document" ? selected.name : "Notes";
  return `<div class="terminal-memory-workspace terminal-memory-workspace--fullscreen" data-terminal-memory-workspace>
    <header class="terminal-memory-appbar">
      <div class="terminal-memory-app-brand">${icon("archive")}<strong>Vibyra Memory</strong></div>
      <div class="terminal-memory-tabs" role="tablist" aria-label="Memory views">
        <button class="${graphActive ? "active" : ""}" type="button" role="tab" aria-selected="${graphActive}" data-terminal-memory-view="graph">${icon("network")}<span>Graph view</span></button>
        <button class="${graphActive ? "" : "active"}" type="button" role="tab" aria-selected="${!graphActive}" data-terminal-memory-view="notes">${icon("document")}<span>${escapeHtml(noteLabel)}</span></button>
      </div>
      <div class="terminal-memory-app-actions">
        ${hasVault ? terminalMemoryFullscreenImportHtml() : ""}
        <button type="button" data-terminal-memory-fullscreen aria-label="Restore terminal and Memory split" aria-pressed="true" title="Restore terminal and Memory split">${icon("split")}</button>
        <button type="button" data-terminal-companion-close aria-label="Close Memory" title="Close Memory">${icon("close")}</button>
      </div>
    </header>
    <div class="terminal-memory-app-body">
      ${terminalMemoryFullscreenRibbonHtml()}
      ${terminalMemoryFullscreenExplorerHtml(projectId, projectName)}
      <main class="terminal-memory-main-pane">
        <header class="terminal-memory-pane-head">
          <span>${icon(graphActive ? "network" : "document")}</span>
          <strong>${escapeHtml(graphActive ? "Graph view" : noteLabel)}</strong>
        </header>
        <div class="terminal-memory-pane-content">${terminalMemoryFullscreenContentHtml(projectId, selected)}</div>
      </main>
      ${terminalMemoryFullscreenLinksHtml(selected)}
    </div>
  </div>`;
}

function terminalMemoryFullscreenRibbonHtml() {
  return `<nav class="terminal-memory-ribbon" aria-label="Memory tools">
    <button class="${terminalMemoryState.view === "graph" ? "active" : ""}" type="button" data-terminal-memory-view="graph" aria-label="Graph view" title="Graph view">${icon("network")}</button>
    <button class="${terminalMemoryState.view === "notes" ? "active" : ""}" type="button" data-terminal-memory-view="notes" aria-label="Notes view" title="Notes view">${icon("document")}</button>
  </nav>`;
}

function terminalMemoryFullscreenImportHtml() {
  return terminalMemoryImportMenuHtml("terminal-memory-app-import-menu");
}

function terminalMemoryFullscreenExplorerHtml(projectId, projectName) {
  return `<aside class="terminal-memory-vault-pane">
    <header class="terminal-memory-vault-head">
      <span><small>Project vault</small><strong title="${escapeAttribute(projectName)}">${escapeHtml(projectName)}</strong></span>
    </header>
    <label class="terminal-memory-search terminal-memory-vault-search">
      ${icon("search")}
      <input type="search" value="${escapeAttribute(terminalMemoryState.query)}" placeholder="Search files" aria-label="Search memory files" data-terminal-memory-search>
    </label>
    <div class="terminal-memory-tree terminal-memory-vault-tree" role="tree" aria-label="Project memory files" data-terminal-memory-tree>
      ${projectId ? terminalMemoryTreeHtml() : '<p class="terminal-memory-empty">Choose a project-backed terminal.</p>'}
    </div>
    <footer>${icon("archive")}<span>${escapeHtml(projectName)}</span><small>${terminalMemoryState.nodes.filter((node) => node.type === "document").length} notes</small></footer>
  </aside>`;
}

function terminalMemoryFullscreenContentHtml(projectId, selected) {
  if (!projectId) return terminalMemoryEmptyDocumentHtml("");
  if (!terminalMemoryState.loaded || !terminalMemoryState.nodes.length) {
    return typeof terminalMemoryOnboardingHtml === "function" ? terminalMemoryOnboardingHtml() : terminalMemoryEmptyDocumentHtml(projectId);
  }
  if (terminalMemoryState.view === "graph" && typeof terminalMemoryGraphHtml === "function") return terminalMemoryGraphHtml();
  return selected?.type === "document"
    ? `<section class="terminal-memory-document">${terminalMemoryDocumentHtml(selected, terminalMemoryState.mode)}</section>`
    : terminalMemoryEmptyDocumentHtml(projectId);
}

function terminalMemoryFullscreenLinksHtml(selected) {
  const topology = terminalMemoryGraphTopology(terminalMemoryState.nodes);
  const connectedIds = new Set();
  if (selected) {
    topology.edges.forEach((edge) => {
      if (edge.from === selected.id) connectedIds.add(edge.to);
      if (edge.to === selected.id) connectedIds.add(edge.from);
    });
  }
  const connected = topology.nodes.filter((node) => connectedIds.has(node.id));
  const rows = connected.length
    ? connected.map((node) => `<button type="button" data-terminal-memory-open-node="${escapeAttribute(node.id)}">${icon(node.type === "folder" ? "folder" : "document")}<span>${escapeHtml(node.name)}</span></button>`).join("")
    : `<p>${selected ? "No links for this note yet." : "Select a note to inspect its links."}</p>`;
  return `<aside class="terminal-memory-links-pane">
    <header><strong>Links</strong><span>${connected.length}</span></header>
    <div class="terminal-memory-links-list">${rows}</div>
    <section><strong>Unlinked mentions</strong><small>References without a direct wiki link appear here.</small></section>
  </aside>`;
}

function bindTerminalMemoryFullscreen(root) {
  root.querySelectorAll("[data-terminal-memory-open-node]").forEach((button) => {
    button.addEventListener("click", () => void selectTerminalMemoryNode(button.dataset.terminalMemoryOpenNode));
  });
  root.querySelectorAll("[data-terminal-companion-close]").forEach((button) => {
    button.addEventListener("click", closeTerminalCompanionPanel);
  });
}
