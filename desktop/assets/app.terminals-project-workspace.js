function terminalWorkspaceProject(key = activeTerminalProjectKey()) {
  if (key === terminalUnassignedProjectKey) return null;
  return terminalProject(key);
}

function terminalWorkspaceGroupStatus(group) {
  const items = group?.terminals || [];
  if (!items.length) return { key: "closed", label: "Ready to open" };
  if (items.some((item) => item.notice || item.providerState === "error" || item.ptyStatus === "unavailable")) {
    return { key: "attention", label: "Needs attention" };
  }
  if (items.some((item) => item.providerState === "busy" || item.providerBusy || item.pending || item.ptyStatus === "starting")) {
    return { key: "working", label: "Working" };
  }
  if (items.every((item) => item.ptyStatus === "exited")) return { key: "stopped", label: "Stopped" };
  return { key: "ready", label: "Ready" };
}

function terminalWorkspaceCapabilities(project) {
  const text = `${project?.stack || ""} ${project?.detectedBrief?.kindId || ""} ${project?.detectedBrief?.frameworkId || ""}`.toLowerCase();
  const capabilities = [
    { mode: "chat", icon: "sparkles", label: "AI" },
    { mode: "memory", icon: "document", label: "Memory" }
  ];
  if (/laravel|python|api|backend|node/.test(text)) {
    capabilities.push({ mode: "terminal", icon: "pulse", label: /laravel|api|backend/.test(text) ? "Services" : "Tests" });
  }
  return capabilities;
}

function terminalWorkspaceDockIdentityHtml() {
  const project = terminalWorkspaceProject();
  const group = terminalProjectGroups().find((item) => item.key === activeTerminalProjectKey());
  const status = terminalWorkspaceGroupStatus(group);
  return `<div class="terminal-workspace-identity" title="${escapeAttribute(project?.path || "General workspace")}">
    <span>${icon(project ? "folder" : "desktop")}</span>
    <span><strong>${escapeHtml(project?.name || "General")}</strong><small>${escapeHtml(status.label)}</small></span>
  </div>`;
}

function terminalWorkspaceQuickActionsHtml(project = terminalWorkspaceProject()) {
  return "";
}

function terminalWorkspaceEmptyHtml() {
  const project = terminalWorkspaceProject();
  const projectId = project?.id || "";
  const capabilities = terminalWorkspaceCapabilities(project);
  return `<section class="terminal-project-home">
    <div class="terminal-project-home-mark">${icon(project ? "folder" : "desktop")}</div>
    <div class="terminal-project-home-copy">
      <small>${escapeHtml(project?.stack || "Flexible workspace")}</small>
      <h1>${escapeHtml(project?.name || "General workspace")}</h1>
      <p>${project ? "Open a focused AI workspace with the right tools already attached to this project." : "Open a terminal without binding it to one project."}</p>
    </div>
    <div class="terminal-project-home-actions">
      <button class="terminal-work-mode primary" type="button" data-terminal-workspace-launch="1" data-terminal-workspace-project="${escapeAttribute(projectId)}">${icon("sparkles")}<span><strong>Solo</strong><small>One focused AI agent</small></span></button>
      <button class="terminal-work-mode" type="button" data-terminal-workspace-launch="4" data-terminal-workspace-project="${escapeAttribute(projectId)}">${icon("people")}<span><strong>Team</strong><small>Four isolated agents</small></span></button>
    </div>
    ${project ? `<div class="terminal-project-capabilities">${capabilities.map((item) => `<span>${icon(item.icon)}${escapeHtml(item.label)}</span>`).join("")}</div>` : ""}
  </section>`;
}

function syncTerminalProjectWorkspaceHome(page = document.querySelector(".terminal-page")) {
  const stage = page?.querySelector(".terminal-stage");
  if (!stage) return false;
  const empty = terminalsForProjectKey().length === 0;
  const existing = stage.querySelector(".terminal-project-home");
  if (empty && !existing) stage.insertAdjacentHTML("afterbegin", terminalWorkspaceEmptyHtml());
  if (!empty && existing) existing.remove();
  page.classList.toggle("terminal-page--project-empty", empty);
  bindTerminalProjectWorkspaceControls(stage);
  return true;
}

function bindTerminalProjectWorkspaceControls(root = document) {
  root.querySelectorAll?.("[data-terminal-workspace-launch]").forEach((button) => {
    if (button.dataset.workspaceLaunchBound) return;
    button.dataset.workspaceLaunchBound = "1";
    button.addEventListener("click", () => {
      openTerminalBatchSetup(button.dataset.terminalWorkspaceProject || "", Number(button.dataset.terminalWorkspaceLaunch) || 1);
    });
  });
}
