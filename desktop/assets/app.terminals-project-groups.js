const terminalProjectActiveKey = "vibyra.desktop.terminalProjectActiveIds";
const terminalActiveWorkspaceKey = "vibyra.desktop.terminalActiveProject";
const terminalUnassignedProjectKey = "__unassigned__";
const terminalTeamProjectPrefix = "__team__:";
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
  const projectId = String(terminal?.projectId || "");
  if (projectId) return projectId;
  const teamId = String(terminal?.teamId || "").trim();
  return teamId ? `${terminalTeamProjectPrefix}${teamId}` : terminalUnassignedProjectKey;
}

function terminalTeamProjectLabel(items = []) {
  const builder = items.find((terminal) => terminal?.teamRoleKey === "builder");
  const assignmentTitle = String(builder?.teamRole || builder?.title || "")
    .replace(/\s+(builder|coordinator|reviewer|verifier)$/i, "")
    .replace(/\s+/g, " ")
    .trim();
  const goal = String(items[0]?.teamGoal || "")
    .replace(/\s+/g, " ")
    .trim()
    .split(/[.!?]/, 1)[0];
  const label = assignmentTitle ? `${assignmentTitle} Team` : goal || "AI Team";
  return label.length > 42 ? `${label.slice(0, 39).trimEnd()}...` : label;
}

function terminalProjectGroupLabel(key, items = []) {
  if (key.startsWith(terminalTeamProjectPrefix)) return terminalTeamProjectLabel(items);
  if (key === terminalUnassignedProjectKey) return "General";
  if (typeof terminalFullPcProjectId === "string" && key === terminalFullPcProjectId) return "Full PC";
  return terminalProject(key)?.name || "Project";
}

function terminalProjectGroups() {
  const groups = new Map();
  for (const terminal of terminals) {
    const key = terminalProjectGroupKey(terminal);
    if (!groups.has(key)) groups.set(key, { key, label: "", project: terminalProject(terminal.projectId), terminals: [] });
    groups.get(key).terminals.push(terminal);
  }
  return Array.from(groups.values(), (group) => {
    const teamId = String(group.terminals[0]?.teamId || "");
    const isTeam = Boolean(teamId) && group.terminals.every((terminal) => terminal.teamId === teamId);
    return { ...group, isTeam, label: terminalProjectGroupLabel(group.key, group.terminals) };
  });
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
  const terminal = group.terminals.find((candidate) => candidate.id === terminalProjectActiveIds[key]) || group.terminals[0];
  setupProjectId = String(terminal?.projectId || "");
  if (setupProjectId) localStorage.setItem(setupProjectKey, setupProjectId);
  else localStorage.removeItem(setupProjectKey);
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
    const detail = group.isTeam ? `Team · ${status.label}` : group.project?.stack || status.label;
    return `<button class="terminal-rail-project ${active ? "active" : ""}" type="button" role="listitem" aria-current="${active ? "page" : "false"}" data-terminal-project-group="${escapeAttribute(group.key)}" title="${escapeAttribute(title)}">
      <span class="terminal-rail-project-icon${group.isTeam ? " is-team" : ""}" aria-hidden="true">${icon(group.isTeam ? "people" : "folder")}<i class="terminal-rail-project-state ${escapeAttribute(status.key)}"></i></span>
      <span class="terminal-rail-project-copy"><span class="terminal-rail-project-name">${escapeHtml(group.label)}</span><small>${escapeHtml(detail)}</small></span>
      <span class="terminal-rail-project-count">${count || ""}</span>
    </button>`;
  }).join("");
  return `<div class="terminal-rail-projects" role="list" aria-label="Open terminal projects">${rows}</div>`;
}

function terminalProjectTabsHtml() {
  const groups = terminalProjectGroups();
  const activeKey = activeTerminalProjectKey();
  const projectRows = groups.map((group) => {
    const active = group.key === activeKey;
    const status = typeof terminalWorkspaceGroupStatus === "function"
      ? terminalWorkspaceGroupStatus(group)
      : { key: group.terminals.length ? "ready" : "closed", label: group.terminals.length ? "Ready" : "Not open" };
    const count = group.terminals.length;
    return `<button class="terminal-project-tab ${active ? "active" : ""}" type="button" role="tab" aria-selected="${active}" data-terminal-project-group="${escapeAttribute(group.key)}" title="${escapeAttribute(`${group.label}, ${status.label}`)}">
      <span class="terminal-project-tab-icon${group.isTeam ? " is-team" : ""}">${icon(group.isTeam ? "people" : "folder")}<i class="terminal-project-tab-state ${escapeAttribute(status.key)}"></i></span>
      <span class="terminal-project-tab-copy"><strong>${escapeHtml(group.label)}</strong><small>${escapeHtml(count === 1 ? "1 agent" : `${count} agents`)}</small></span>
    </button>`;
  }).join("");
  const full = terminalBatchAvailableSlots() < 1;
  const menu = terminalToolbarMenuOpen ? `<div class="terminal-menu terminal-toolbar-menu" role="menu">
    <button type="button" id="toggle-terminal-layout">${icon(terminalLayout === "grid" ? "terminal" : "grid")}<span>${terminalLayout === "grid" ? "Focus view" : "Grid view"}</span></button>
    <button class="danger" type="button" data-terminal-close-all>${icon("trash")}<span>Close all agents</span></button>
  </div>` : "";
  const companionTools = typeof terminalCompanionToolbarHtml === "function" ? terminalCompanionToolbarHtml() : "";
  return `<header class="terminal-project-tabs" role="tablist" aria-label="Terminal projects">
    <div class="terminal-project-tab-list">${projectRows}</div>
    <div class="terminal-project-actions">
      <div class="terminal-new-wrap"><button class="terminal-add" id="open-terminal-new" type="button" aria-label="New agent" title="New agent" ${full ? "disabled" : ""}>${icon("plus")}</button>${newTerminalMenuOpen ? newTerminalMenu() : ""}</div>
      ${companionTools}
      <div class="terminal-toolbar-wrap"><button class="terminal-layout-button" id="open-terminal-toolbar" type="button" aria-haspopup="menu" aria-expanded="${terminalToolbarMenuOpen ? "true" : "false"}" aria-label="Terminal options" title="Terminal options">${icon("menu")}</button>${menu}</div>
    </div>
  </header>`;
}

function terminalRailAgentsHtml(projectTerminals = terminalsForProjectKey()) {
  if (activePage !== "terminals" || terminalBatchSetupOpen || !terminals.length) return "";
  const rows = projectTerminals.map((terminal, index) => terminalAgentSidebarRowHtml(terminal, index)).join("");
  const empty = rows || `<div class="terminal-agent-empty">${icon("terminal")}<span>No agents</span></div>`;
  return `<div class="terminal-rail-agents" aria-label="Project agents">
    <div class="terminal-rail-agents-head"><span>Agents</span><strong>${projectTerminals.length}/${maxTerminals}</strong></div>
    <div class="terminal-agent-list" role="tablist" aria-label="Agents in selected project">${empty}</div>
  </div>`;
}

function terminalAgentSidebarRowHtml(terminal, index) {
  const active = terminal.id === activeTerminalId;
  const label = terminalTabAgentLabel(terminal, index);
  const agent = typeof terminalAgentDisplayName === "function" ? terminalAgentDisplayName(terminal) : "";
  const project = typeof projectForTerminal === "function" ? projectForTerminal(terminal) : null;
  const detail = agent || project?.name || "AI agent";
  return `<div class="terminal-agent-nav-item ${active ? "active" : ""}" draggable="true" data-terminal-drag="${escapeAttribute(terminal.id)}" title="${escapeAttribute(`${label}, ${detail}`)}">
    <button class="terminal-agent-nav-open" type="button" role="tab" aria-selected="${active}" data-terminal-focus="${escapeAttribute(terminal.id)}" aria-label="Open ${escapeAttribute(label)}">${terminalStatusDot(terminal)}<span><strong>${escapeHtml(label)}</strong><small>${escapeHtml(detail)}</small></span></button>
    <button class="terminal-agent-nav-close" type="button" data-terminal-close="${escapeAttribute(terminal.id)}" aria-label="Close ${escapeAttribute(label)}">${icon("close")}</button>
  </div>`;
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
