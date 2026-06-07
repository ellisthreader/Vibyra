let terminalProjectMemory = { entries: [], updatedAt: "" };
let terminalMemoryLoading = false;
let terminalMemoryPosting = false;
let terminalMemoryNotice = "";
let terminalMemoryLoadedProjectId = "";

function terminalMemoryHtml() {
  const terminal = terminalCompanionActiveTerminal();
  const projectId = terminal?.projectId || "";
  if (projectId && projectId !== terminalMemoryLoadedProjectId && !terminalMemoryLoading) void loadTerminalProjectMemory(projectId);
  const entries = terminalProjectMemory.entries || [];
  const rows = entries.length
    ? entries.map(terminalMemoryRow).join("")
    : `<p class="terminal-memory-empty">${terminalMemoryLoading ? "Loading project memory..." : projectId ? "No saved memory for this project." : "Select a project to use Memory."}</p>`;
  return `<div class="terminal-companion-head"><span>Memory</span><div class="terminal-companion-head-actions"><small>${entries.length}/8 saved</small><button type="button" data-terminal-companion-close aria-label="Close Memory">${icon("close")}</button></div></div>
    <p class="terminal-memory-project">${escapeHtml(terminalProjectName(terminal) || "No project selected")}</p>
    <div class="terminal-memory-list" role="list" aria-label="Saved project memory">${rows}</div>
    <form class="terminal-memory-add" data-terminal-memory-form>
      <label for="terminal-memory-text">Remember for this project</label>
      <textarea id="terminal-memory-text" maxlength="220" rows="3" data-terminal-memory-text placeholder="A stable rule, decision, or project preference"></textarea>
      <div class="terminal-memory-actions">
        <small>${escapeHtml(terminalMemoryNotice)}</small>
        <button class="terminal-tool-button primary" type="submit" ${!projectId || terminalMemoryPosting || entries.length >= 8 ? "disabled" : ""}>${icon("plus")}<span>${terminalMemoryPosting ? "Saving" : "Remember"}</span></button>
      </div>
    </form>`;
}

function bindTerminalMemory(root = document) {
  root.querySelector("[data-terminal-memory-form]")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const text = root.querySelector("[data-terminal-memory-text]")?.value || "";
    void addTerminalProjectMemory(text);
  });
  root.querySelectorAll("[data-terminal-memory-use]").forEach((button) => button.addEventListener("click", () => {
    const entry = terminalProjectMemory.entries.find((item) => item.id === button.dataset.terminalMemoryUse);
    if (entry) terminalCompanionInsertIntoActiveTerminal(entry.text, false);
  }));
  root.querySelectorAll("[data-terminal-memory-delete]").forEach((button) => button.addEventListener("click", () => {
    if (window.confirm("Delete this project memory?")) void deleteTerminalProjectMemory(button.dataset.terminalMemoryDelete);
  }));
}

async function loadTerminalProjectMemory(projectId, force = false) {
  if (!projectId || terminalMemoryLoading || (!force && projectId === terminalMemoryLoadedProjectId)) return;
  terminalMemoryLoading = true;
  terminalMemoryNotice = "";
  if (terminalCompanionMode === "memory") syncTerminalCompanion("memory");
  try {
    const response = await fetch(`/desktop/project-memory?projectId=${encodeURIComponent(projectId)}`, { headers: { Accept: "application/json" } });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result.ok === false) throw new Error(result.error || "Project memory could not load.");
    terminalProjectMemory = normalizeTerminalProjectMemory(result.memory);
    terminalMemoryLoadedProjectId = projectId;
  } catch (error) {
    terminalMemoryNotice = error instanceof Error ? error.message : "Project memory could not load.";
    terminalProjectMemory = { entries: [], updatedAt: "" };
    terminalMemoryLoadedProjectId = projectId;
  } finally {
    terminalMemoryLoading = false;
    if (terminalCompanionMode === "memory") syncTerminalCompanion("memory");
  }
}

async function addTerminalProjectMemory(text) {
  const terminal = terminalCompanionActiveTerminal();
  const projectId = terminal?.projectId || "";
  const clean = String(text || "").replace(/\s+/g, " ").trim().slice(0, 220);
  if (!projectId || !clean || terminalMemoryPosting) return;
  terminalMemoryPosting = true;
  terminalMemoryNotice = "";
  syncTerminalCompanion("memory");
  try {
    const response = await fetch(`/desktop/project-memory?projectId=${encodeURIComponent(projectId)}`, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ text: clean })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result.ok === false) throw new Error(result.error || "Project memory could not be saved.");
    terminalProjectMemory = normalizeTerminalProjectMemory(result.memory);
    terminalMemoryLoadedProjectId = projectId;
    terminalMemoryNotice = "Saved";
  } catch (error) {
    terminalMemoryNotice = error instanceof Error ? error.message : "Project memory could not be saved.";
  } finally {
    terminalMemoryPosting = false;
    syncTerminalCompanion("memory");
  }
}

async function deleteTerminalProjectMemory(entryId) {
  const terminal = terminalCompanionActiveTerminal();
  const projectId = terminal?.projectId || "";
  if (!projectId || !entryId || terminalMemoryPosting) return;
  terminalMemoryPosting = true;
  syncTerminalCompanion("memory");
  try {
    const response = await fetch(`/desktop/project-memory/entry?projectId=${encodeURIComponent(projectId)}&entryId=${encodeURIComponent(entryId)}`, { method: "DELETE", headers: { Accept: "application/json" } });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result.ok === false) throw new Error(result.error || "Project memory could not be removed.");
    terminalProjectMemory = normalizeTerminalProjectMemory(result.memory);
    terminalMemoryNotice = "Removed";
  } catch (error) {
    terminalMemoryNotice = error instanceof Error ? error.message : "Project memory could not be removed.";
  } finally {
    terminalMemoryPosting = false;
    syncTerminalCompanion("memory");
  }
}

function terminalMemoryRow(entry) {
  const locked = entry.source === "brief";
  return `<article class="terminal-memory-row" role="listitem"><p>${escapeHtml(entry.text)}</p><div>
    <button type="button" data-terminal-memory-use="${escapeAttribute(entry.id)}">Insert</button>
    ${locked ? "<span>Project brief</span>" : `<button type="button" data-terminal-memory-delete="${escapeAttribute(entry.id)}" aria-label="Delete memory">${icon("trash")}</button>`}
  </div></article>`;
}

function normalizeTerminalProjectMemory(value) {
  const entries = Array.isArray(value?.entries) ? value.entries.map((entry) => ({
    id: String(entry?.id || ""),
    text: String(entry?.text || "").trim().slice(0, 220),
    source: entry?.source === "brief" ? "brief" : "user",
    createdAt: String(entry?.createdAt || "")
  })).filter((entry) => entry.id && entry.text).slice(-8) : [];
  return { entries, updatedAt: String(value?.updatedAt || "") };
}

function terminalProjectName(terminal) {
  return projectForTerminal(terminal)?.name || terminal?.projectId || "";
}
