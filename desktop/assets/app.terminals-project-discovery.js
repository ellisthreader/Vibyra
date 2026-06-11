let terminalProjectQuery = "";
let terminalProjectSearchTimer = null;
let terminalProjectSearchPending = false;
let terminalProjectPickerError = "";
let terminalProjectPickerPending = "";

function terminalProjectResults(target, selectedId) {
  const projects = filteredTerminalProjects();
  const rows = [
    terminalProjectOption(target, "", "No project", "Use the default workspace", selectedId),
    terminalProjectOption(target, terminalFullPcProjectId, "Browse full PC", "Choose any project folder on this computer", selectedId),
    ...projects.map((project) => terminalProjectOption(target, project.id, project.name || "Project", project.stack || project.path || "Project folder", selectedId))
  ].join("");
  const searching = terminalProjectSearchPending ? '<p class="terminal-project-status">Searching this PC...</p>' : "";
  const empty = terminalProjectQuery && !projects.length && !terminalProjectSearchPending
    ? '<p class="terminal-project-status">No matching projects yet. Choose a folder or file below.</p>'
    : "";
  return `<div role="listbox" aria-label="Terminal projects">${rows}</div>${searching}${empty}`;
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
  terminalProjectPickerError = "";
  refreshTerminalProjectResults(input.dataset.terminalProjectSearch || "setup");
  clearTimeout(terminalProjectSearchTimer);
  if (!normalizeTerminalProjectSearch(terminalProjectQuery)) {
    terminalProjectSearchPending = false;
    return;
  }
  terminalProjectSearchTimer = setTimeout(() => void searchTerminalProjects(terminalProjectQuery, input.dataset.terminalProjectSearch || "setup"), 220);
}

function handleTerminalProjectSearchKeydown(event) {
  if (event.key !== "ArrowDown") return;
  event.preventDefault();
  event.currentTarget.closest("[data-terminal-project-menu]")?.querySelector("[data-terminal-project-option]")?.focus();
}

async function searchTerminalProjects(query, target) {
  const requestedQuery = query;
  terminalProjectSearchPending = true;
  refreshTerminalProjectResults(target);
  try {
    const response = await fetch(`/desktop/projects/search?q=${encodeURIComponent(requestedQuery)}`, { cache: "no-store" });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Project search failed.");
    mergeTerminalProjectChoices(result.projects);
  } catch (error) {
    terminalProjectPickerError = error instanceof Error ? error.message : "Project search failed.";
  } finally {
    if (requestedQuery === terminalProjectQuery) {
      terminalProjectSearchPending = false;
      refreshTerminalProjectResults(target);
    }
  }
}

async function pickTerminalProject(kind, target) {
  if (!window.vibyraDesktopProjects?.pick || terminalProjectPickerPending) {
    terminalProjectPickerError = "Project browsing is available in the Vibyra Desktop app.";
    refreshTerminalProjectPicker(target, false);
    return;
  }
  terminalProjectPickerPending = kind;
  terminalProjectPickerError = "";
  refreshTerminalProjectPicker(target, false);
  try {
    const selection = await window.vibyraDesktopProjects.pick(kind);
    if (selection?.canceled || !selection?.path) return;
    const response = await fetch("/desktop/projects/select", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: selection.path })
    });
    const result = await response.json();
    if (!response.ok || !result.project) throw new Error(result.error || "That location could not be opened.");
    mergeTerminalProjectChoices([result.project]);
    terminalProjectQuery = "";
    selectTerminalProject(result.project.id, target);
  } catch (error) {
    terminalProjectPickerError = error instanceof Error ? error.message : "That location could not be opened.";
  } finally {
    terminalProjectPickerPending = "";
    refreshTerminalProjectPicker(target, false);
  }
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
