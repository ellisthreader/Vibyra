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
    return { id: terminalFullPcProjectId, name: "Full PC", path: "Browse and choose any project folder" };
  }
  return terminalProjectChoices().find((project) => project.id === projectId) || null;
}

function terminalProjectLabel(projectId) {
  return terminalProject(projectId)?.name || (projectId ? "Selected project" : "No project");
}

function terminalProjectPath(projectId) {
  const project = terminalProject(projectId);
  return project?.stack || project?.path || (projectId ? "Project folder" : "Default workspace");
}

function terminalProjectSelect(target, selectedId = terminalProjectForSetup()) {
  const open = terminalProjectMenuTarget === target;
  return `<div class="terminal-project-picker" data-terminal-project-picker="${escapeAttribute(target)}"><button class="terminal-project-select ${open ? "open" : ""}" type="button" data-terminal-project-toggle="${escapeAttribute(target)}" aria-haspopup="listbox" aria-expanded="${open ? "true" : "false"}">${icon("folder")}<span><strong>${escapeHtml(terminalProjectLabel(selectedId))}</strong><small>${escapeHtml(terminalProjectPath(selectedId))}</small></span>${icon("chevron-down")}</button>${open ? terminalProjectMenu(target, selectedId) : ""}</div>`;
}

function terminalProjectMenu(target, selectedId) {
  return `<div class="terminal-project-menu" data-terminal-project-menu="${escapeAttribute(target)}" role="dialog" aria-label="Choose terminal project">
    <label class="terminal-project-search">${icon("search")}<input data-terminal-project-search="${escapeAttribute(target)}" value="${escapeAttribute(terminalProjectQuery)}" placeholder="Search projects anywhere on this PC" autocomplete="off" /></label>
    <div class="terminal-project-results" data-terminal-project-results="${escapeAttribute(target)}">${terminalProjectResults(target, selectedId)}</div>
    <div class="terminal-project-actions">
      <button type="button" data-terminal-project-pick="folder" data-terminal-project-pick-target="${escapeAttribute(target)}">${icon("folder")}<span><strong>${terminalProjectPickerPending === "folder" ? "Opening..." : "Choose folder"}</strong><small>Select any folder on this PC</small></span></button>
      <button type="button" data-terminal-project-pick="file" data-terminal-project-pick-target="${escapeAttribute(target)}">${icon("document")}<span><strong>${terminalProjectPickerPending === "file" ? "Opening..." : "Choose file"}</strong><small>Use the file's containing folder</small></span></button>
    </div>
    ${terminalProjectPickerError ? `<p class="terminal-project-error" role="alert">${escapeHtml(terminalProjectPickerError)}</p>` : ""}
  </div>`;
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
  if (target === "setup" && typeof render === "function") render();
}

function toggleTerminalProjectMenu(target, open = terminalProjectMenuTarget !== target, focusOption = false) {
  terminalProjectMenuTarget = open ? target : "";
  terminalProjectPickerError = "";
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
    (menu?.querySelector("[data-terminal-project-search]") || menu?.querySelector('[aria-selected="true"]'))?.focus();
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
      activateTerminalProjectOption(
        button.dataset.terminalProjectOption || "",
        button.dataset.terminalProjectOptionTarget || "setup"
      );
    });
    button.addEventListener("keydown", handleTerminalProjectOptionKeydown);
  });
  root.querySelectorAll?.("[data-terminal-project-search]").forEach((input) => {
    if (input.dataset.terminalProjectBound) return;
    input.dataset.terminalProjectBound = "1";
    input.addEventListener("click", (event) => event.stopPropagation());
    input.addEventListener("input", () => updateTerminalProjectSearch(input));
    input.addEventListener("keydown", handleTerminalProjectSearchKeydown);
  });
  root.querySelectorAll?.("[data-terminal-project-pick]").forEach((button) => {
    if (button.dataset.terminalProjectBound) return;
    button.dataset.terminalProjectBound = "1";
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      void pickTerminalProject(button.dataset.terminalProjectPick || "folder", button.dataset.terminalProjectPickTarget || "setup");
    });
  });
  bindTerminalProjectDismiss();
}

function activateTerminalProjectOption(projectId, target) {
  if (projectId === terminalFullPcProjectId) {
    void pickTerminalProject("folder", target);
    return;
  }
  selectTerminalProject(projectId, target);
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
