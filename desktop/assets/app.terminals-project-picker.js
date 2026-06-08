let terminalProjectMenuTarget = "";
let terminalProjectDismissBound = false;
const terminalFullPcProjectId = "full-pc";

function terminalProjectChoices() {
  return Array.isArray(currentState.projects) ? currentState.projects : [];
}

function terminalProjectForSetup() {
  const projects = terminalProjectChoices();
  if (setupProjectId === terminalFullPcProjectId) return setupProjectId;
  if (setupProjectId && projects.some((project) => project.id === setupProjectId)) return setupProjectId;
  if (setupProjectId && !projects.length) return setupProjectId;
  setupProjectId = "";
  localStorage.removeItem(setupProjectKey);
  return "";
}

function terminalProjectReadyForSetup() {
  if (!setupProjectId || setupProjectId === terminalFullPcProjectId) return true;
  return terminalProjectChoices().some((project) => project.id === setupProjectId);
}

function terminalProject(projectId) {
  if (projectId === terminalFullPcProjectId) {
    return { id: terminalFullPcProjectId, name: "Full PC", path: "Browse from your home folder" };
  }
  return terminalProjectChoices().find((project) => project.id === projectId) || null;
}

function terminalProjectLabel(projectId) {
  return terminalProject(projectId)?.name || (projectId ? "Selected project" : "No project");
}

function terminalProjectPath(projectId) {
  return terminalProject(projectId)?.path || (projectId ? "Project folder" : "Default workspace");
}

function terminalProjectSelect(target, selectedId = terminalProjectForSetup()) {
  const open = terminalProjectMenuTarget === target;
  return `<div class="terminal-project-picker" data-terminal-project-picker="${escapeAttribute(target)}"><button class="terminal-project-select ${open ? "open" : ""}" type="button" data-terminal-project-toggle="${escapeAttribute(target)}" aria-haspopup="listbox" aria-expanded="${open ? "true" : "false"}">${icon("folder")}<span><strong>${escapeHtml(terminalProjectLabel(selectedId))}</strong><small>${escapeHtml(terminalProjectPath(selectedId))}</small></span>${icon("chevron-down")}</button>${open ? terminalProjectMenu(target, selectedId) : ""}</div>`;
}

function terminalProjectMenu(target, selectedId) {
  const projects = terminalProjectChoices();
  const rows = [
    terminalProjectOption(target, "", "No project", "Use the default workspace", selectedId),
    terminalProjectOption(target, terminalFullPcProjectId, "Full PC", "Browse from your home folder", selectedId),
    ...projects.map((project) => terminalProjectOption(target, project.id, project.name || "Project", project.path || "Project folder", selectedId))
  ].join("");
  return `<div class="terminal-project-menu" data-terminal-project-menu="${escapeAttribute(target)}" role="listbox" aria-label="Terminal project">${rows}</div>`;
}

function terminalProjectOption(target, id, name, path, selectedId) {
  const selected = id === selectedId;
  return `<button class="terminal-project-option ${selected ? "active" : ""}" type="button" role="option" aria-selected="${selected ? "true" : "false"}" data-terminal-project-option="${escapeAttribute(id)}" data-terminal-project-option-target="${escapeAttribute(target)}">${icon(id ? "folder" : "minus")}<span><strong>${escapeHtml(name)}</strong><small>${escapeHtml(path)}</small></span><i>${selected ? icon("check") : ""}</i></button>`;
}

function selectTerminalProject(projectId, target = terminalProjectMenuTarget || "setup") {
  setupProjectId = projectId || "";
  if (setupProjectId) localStorage.setItem(setupProjectKey, setupProjectId);
  else localStorage.removeItem(setupProjectKey);
  terminalProjectMenuTarget = "";
  refreshTerminalProjectPicker(target, false);
}

function toggleTerminalProjectMenu(target, open = terminalProjectMenuTarget !== target, focusOption = false) {
  terminalProjectMenuTarget = open ? target : "";
  if (open && target === "setup") {
    setupModelMenuOpen = false;
    document.querySelector('[data-terminal-model-picker="setup"]')?.remove();
  }
  refreshTerminalProjectPicker(target, focusOption);
}

function refreshTerminalProjectPicker(target, focusOption) {
  const picker = document.querySelector(`[data-terminal-project-picker="${CSS.escape(target)}"]`);
  if (!picker) return;
  picker.outerHTML = terminalProjectSelect(target);
  bindTerminalProjectControls(document);
  if (!focusOption) return;
  requestAnimationFrame(() => {
    const menu = document.querySelector(`[data-terminal-project-menu="${CSS.escape(target)}"]`);
    (menu?.querySelector('[aria-selected="true"]') || menu?.querySelector("[data-terminal-project-option]"))?.focus();
  });
}

function bindTerminalProjectControls(root = document) {
  root.querySelectorAll?.("[data-terminal-project-toggle]").forEach((button) => {
    if (button.dataset.terminalProjectBound) return;
    button.dataset.terminalProjectBound = "1";
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      toggleTerminalProjectMenu(button.dataset.terminalProjectToggle || "setup");
    });
    button.addEventListener("keydown", (event) => {
      if (event.key !== "ArrowDown") return;
      event.preventDefault();
      toggleTerminalProjectMenu(button.dataset.terminalProjectToggle || "setup", true, true);
    });
  });
  root.querySelectorAll?.("[data-terminal-project-option]").forEach((button) => {
    if (button.dataset.terminalProjectBound) return;
    button.dataset.terminalProjectBound = "1";
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      selectTerminalProject(button.dataset.terminalProjectOption || "", button.dataset.terminalProjectOptionTarget || "setup");
    });
    button.addEventListener("keydown", handleTerminalProjectOptionKeydown);
  });
  bindTerminalProjectDismiss();
}

function handleTerminalProjectOptionKeydown(event) {
  const option = event.currentTarget;
  const menu = option.closest("[data-terminal-project-menu]");
  const options = Array.from(menu?.querySelectorAll("[data-terminal-project-option]") || []);
  const index = options.indexOf(option);
  if (event.key === "Escape") {
    event.preventDefault();
    const target = menu?.dataset.terminalProjectMenu || "setup";
    toggleTerminalProjectMenu(target, false);
    document.querySelector(`[data-terminal-project-toggle="${CSS.escape(target)}"]`)?.focus();
    return;
  }
  const next = event.key === "ArrowDown" ? index + 1 : event.key === "ArrowUp" ? index - 1 : event.key === "Home" ? 0 : event.key === "End" ? options.length - 1 : null;
  if (next === null) return;
  event.preventDefault();
  options[(next + options.length) % options.length]?.focus();
}

function bindTerminalProjectDismiss() {
  if (terminalProjectDismissBound) return;
  terminalProjectDismissBound = true;
  document.addEventListener("click", (event) => {
    if (!terminalProjectMenuTarget || event.target.closest("[data-terminal-project-picker]")) return;
    toggleTerminalProjectMenu(terminalProjectMenuTarget, false);
  });
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || !terminalProjectMenuTarget) return;
    const target = terminalProjectMenuTarget;
    toggleTerminalProjectMenu(target, false);
    document.querySelector(`[data-terminal-project-toggle="${CSS.escape(target)}"]`)?.focus();
  });
}
