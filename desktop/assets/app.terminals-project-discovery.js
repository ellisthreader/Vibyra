let terminalProjectQuery = "";

function terminalProjectResults(target, selectedId) {
  const projects = filteredTerminalProjects();
  const rows = projects.map((project) => terminalProjectOption(target, project.id, project.name || "Project", project.stack || project.path || "Project folder", selectedId)).join("");
  const empty = !projects.length
    ? `<p class="terminal-project-status">${terminalProjectQuery ? "No matching projects." : "No projects found."}</p>`
    : "";
  return `<div role="listbox" aria-label="Terminal projects">${rows}</div>${empty}`;
}

function filteredTerminalProjects() {
  const query = normalizeTerminalProjectSearch(terminalProjectQuery);
  if (!query) return terminalProjectChoices();
  const tokens = query.split(" ");
  return terminalProjectChoices()
    .map((project) => {
      const name = normalizeTerminalProjectSearch(project.name);
      const details = normalizeTerminalProjectSearch(`${project.path || ""} ${project.stack || ""}`);
      const matched = tokens.every((token) => name.includes(token) || details.includes(token));
      const score = name === query ? 4 : name.startsWith(query) ? 3 : name.includes(query) ? 2 : matched ? 1 : 0;
      return { project, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || String(a.project.name).localeCompare(String(b.project.name)))
    .map((item) => item.project);
}

function normalizeTerminalProjectSearch(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}

function updateTerminalProjectSearch(input) {
  terminalProjectQuery = input.value;
  refreshTerminalProjectResults(input.dataset.terminalProjectSearch || "setup");
}

function handleTerminalProjectSearchKeydown(event) {
  if (event.key !== "ArrowDown") return;
  event.preventDefault();
  event.currentTarget.closest("[data-terminal-project-menu]")?.querySelector("[data-terminal-project-option]")?.focus();
}

function mergeTerminalProjectChoices(projects) {
  if (!Array.isArray(projects) || !projects.length) return;
  const merged = [];
  const seen = new Set();
  for (const project of [...projects, ...(currentState.projects || [])]) {
    if (!project?.id || seen.has(project.id)) continue;
    seen.add(project.id);
    merged.push(project);
  }
  currentState = { ...currentState, projects: merged };
}

function refreshTerminalProjectResults(target) {
  const results = document.querySelector(`[data-terminal-project-results="${CSS.escape(target)}"]`);
  if (!results) return;
  results.innerHTML = terminalProjectResults(target, terminalProjectForSetup());
  bindTerminalProjectControls(results);
}
