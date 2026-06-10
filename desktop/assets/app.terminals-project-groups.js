const terminalProjectActiveKey = "vibyra.desktop.terminalProjectActiveIds";
const terminalActiveWorkspaceKey = "vibyra.desktop.terminalActiveProject";
const terminalUnassignedProjectKey = "__unassigned__";
let terminalProjectActiveIds = loadTerminalProjectActiveIds();
let terminalActiveProjectKey = localStorage.getItem(terminalActiveWorkspaceKey) || "";
let terminalBatchSetupOpen = false;
let terminalBatchSetupSnapshot = null;

function loadTerminalProjectActiveIds() {
  try {
    const value = JSON.parse(localStorage.getItem(terminalProjectActiveKey) || "{}");
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  } catch {
    return {};
  }
}

function terminalProjectGroupKey(terminal) {
  return String(terminal?.projectId || "") || terminalUnassignedProjectKey;
}

function terminalProjectGroupLabel(key) {
  if (key === terminalUnassignedProjectKey) return "General";
  if (typeof terminalFullPcProjectId === "string" && key === terminalFullPcProjectId) return "Full PC";
  return terminalProject(key)?.name || "Project";
}

function terminalProjectGroups() {
  const groups = new Map();
  for (const terminal of terminals) {
    const key = terminalProjectGroupKey(terminal);
    if (!groups.has(key)) groups.set(key, { key, label: terminalProjectGroupLabel(key), project: terminalProject(key), terminals: [] });
    groups.get(key).terminals.push(terminal);
  }
  return Array.from(groups.values());
}

function activeTerminalProjectKey() {
  if (terminalActiveProjectKey && terminalProjectGroups().some((group) => group.key === terminalActiveProjectKey)) {
    return terminalActiveProjectKey;
  }
  const active = findTerminal(activeTerminalId);
  if (active) return terminalProjectGroupKey(active);
  return terminalProjectGroups()[0]?.key || terminalUnassignedProjectKey;
}

function terminalsForProjectKey(key = activeTerminalProjectKey()) {
  return terminals.filter((terminal) => terminalProjectGroupKey(terminal) === key);
}

function rememberActiveTerminalForProject(terminal) {
  if (!terminal?.id) return;
  terminalProjectActiveIds[terminalProjectGroupKey(terminal)] = terminal.id;
  localStorage.setItem(terminalProjectActiveKey, JSON.stringify(terminalProjectActiveIds));
}

function activateTerminalProjectForTerminal(terminal) {
  if (!terminal) return;
  setTerminalActiveProjectKey(terminalProjectGroupKey(terminal));
}

function setTerminalActiveProjectKey(key) {
  terminalActiveProjectKey = String(key || terminalUnassignedProjectKey);
  localStorage.setItem(terminalActiveWorkspaceKey, terminalActiveProjectKey);
}

function setActiveTerminalProject(key) {
  const group = terminalProjectGroups().find((candidate) => candidate.key === key);
  if (!group) return;
  if (terminalBatchSetupOpen) closeTerminalBatchSetup({ shouldRender: false });
  setTerminalActiveProjectKey(key);
  setupProjectId = key === terminalUnassignedProjectKey ? "" : key;
  if (setupProjectId) localStorage.setItem(setupProjectKey, setupProjectId);
  else localStorage.removeItem(setupProjectKey);
  const terminal = group.terminals.find((candidate) => candidate.id === terminalProjectActiveIds[key]) || group.terminals[0];
  if (!terminal) return;
  setActiveTerminal(terminal.id);
  if (activePage !== "terminals") setPage("terminals");
  else renderNav();
}

function terminalBatchAvailableSlots() {
  return Math.max(0, maxTerminals - terminals.length);
}

function terminalRailCreateButtonHtml() {
  const full = terminalBatchAvailableSlots() < 1;
  const label = full ? `Terminal limit reached (${maxTerminals})` : "New terminal group";
  return `<button class="terminal-rail-create" type="button" data-terminal-batch-new aria-label="${escapeAttribute(label)}" title="${escapeAttribute(label)}" ${full ? "disabled" : ""}>${icon("plus")}</button>`;
}

function openTerminalBatchSetup(projectId = "", preferredCount = 4) {
  const available = terminalBatchAvailableSlots();
  if (!available) return;
  terminalBatchSetupSnapshot = {
    count: setupCount,
    projectId: setupProjectId,
    modelMenuOpen: setupModelMenuOpen,
    projectMenuTarget: terminalProjectMenuTarget
  };
  terminalBatchSetupOpen = true;
  setupCount = Math.min(preferredCount, available);
  if (typeof resetTerminalSetupFlow === "function") resetTerminalSetupFlow();
  setupProjectId = projectId;
  setupModelMenuOpen = false;
  terminalProjectMenuTarget = "";
  newTerminalMenuOpen = false;
  terminalToolbarMenuOpen = false;
  settingsTerminalId = "";
  forceTerminalRender = true;
  if (activePage !== "terminals") setPage("terminals");
  else render();
}

function closeTerminalBatchSetup({ restore = true, shouldRender = true } = {}) {
  if (!terminalBatchSetupOpen) return;
  terminalBatchSetupOpen = false;
  if (typeof resetTerminalSetupFlow === "function") resetTerminalSetupFlow();
  if (restore && terminalBatchSetupSnapshot) {
    setupCount = terminalBatchSetupSnapshot.count;
    setupProjectId = terminalBatchSetupSnapshot.projectId;
    setupModelMenuOpen = terminalBatchSetupSnapshot.modelMenuOpen;
    terminalProjectMenuTarget = terminalBatchSetupSnapshot.projectMenuTarget;
    if (setupProjectId) localStorage.setItem(setupProjectKey, setupProjectId);
    else localStorage.removeItem(setupProjectKey);
  }
  terminalBatchSetupSnapshot = null;
  forceTerminalRender = true;
  if (shouldRender) render();
}

function completeTerminalBatchSetup() {
  terminalBatchSetupOpen = false;
  terminalBatchSetupSnapshot = null;
  if (typeof resetTerminalSetupFlow === "function") resetTerminalSetupFlow();
}

function terminalRailProjectsHtml() {
  const groups = terminalProjectGroups();
  if (!groups.length) return "";
  const activeKey = activeTerminalProjectKey();
  const rows = groups.map((group) => {
    const active = activePage === "terminals" && group.key === activeKey;
    const status = typeof terminalWorkspaceGroupStatus === "function"
      ? terminalWorkspaceGroupStatus(group)
      : { key: group.terminals.length ? "ready" : "closed", label: group.terminals.length ? "Ready" : "Not open" };
    const count = group.terminals.length;
    const title = `${group.label}, ${status.label}, ${count} terminal${count === 1 ? "" : "s"}`;
    return `<button class="terminal-rail-project ${active ? "active" : ""}" type="button" role="listitem" aria-current="${active ? "page" : "false"}" data-terminal-project-group="${escapeAttribute(group.key)}" title="${escapeAttribute(title)}">
      <span class="terminal-rail-project-icon" aria-hidden="true">${icon("folder")}<i class="terminal-rail-project-state ${escapeAttribute(status.key)}"></i></span>
      <span class="terminal-rail-project-copy"><span class="terminal-rail-project-name">${escapeHtml(group.label)}</span><small>${escapeHtml(group.project?.stack || status.label)}</small></span>
      <span class="terminal-rail-project-count">${count || ""}</span>
    </button>`;
  }).join("");
  return `<div class="terminal-rail-projects" role="list" aria-label="Open terminal projects">${rows}</div>`;
}

function bindTerminalProjectGroupControls(root) {
  if (!root || root.dataset.terminalProjectGroupsBound) return;
  root.dataset.terminalProjectGroupsBound = "1";
  root.addEventListener("click", (event) => {
    const createButton = event.target.closest("[data-terminal-batch-new]");
    if (createButton && root.contains(createButton)) {
      event.preventDefault();
      event.stopPropagation();
      openTerminalBatchSetup();
      return;
    }
    const button = event.target.closest("[data-terminal-project-group]");
    if (button && root.contains(button)) setActiveTerminalProject(button.dataset.terminalProjectGroup || "");
  });
  root.addEventListener("keydown", (event) => {
    const button = event.target.closest("[data-terminal-project-group]");
    if (!button || !root.contains(button)) return;
    const rows = Array.from(root.querySelectorAll("[data-terminal-project-group]"));
    const index = rows.indexOf(button);
    let next = index;
    if (event.key === "ArrowDown") next = (index + 1) % rows.length;
    if (event.key === "ArrowUp") next = (index - 1 + rows.length) % rows.length;
    if (event.key === "Home") next = 0;
    if (event.key === "End") next = rows.length - 1;
    if (next === index) return;
    event.preventDefault();
    rows[next]?.focus();
  });
}
