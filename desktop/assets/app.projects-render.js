function projectPathLabel(project) {
  return project.path || project.stack || "Local project";
}

function projectStackLabel(project) {
  return project.stack || displayProjectSource(project);
}

function projectCard(project, index) {
  const active = selectedProjectId ? selectedProjectId === project.id : index === 0;
  const source = displayProjectSource(project);
  return `<article class="project-row ${active ? "active" : ""}">
    <button class="project-row-open" type="button" data-project-select="${escapeAttribute(project.id)}" aria-pressed="${active}">
      <span class="project-icon">${icon("folder")}</span>
      <span class="project-name-wrap">
        <strong class="project-name">${escapeHtml(project.name || "Project")}</strong>
        <small class="project-path">${escapeHtml(projectPathLabel(project))}</small>
      </span>
    </button>
    <span class="project-stack">${escapeHtml(projectStackLabel(project))}</span>
    <span class="project-source ${source === "Phone" ? "is-phone" : "is-desktop"}"><i></i>${escapeHtml(source)}</span>
    <button class="project-chat-button" type="button" data-project-terminal="${escapeAttribute(project.id)}">${icon("terminal")}Open terminal</button>
  </article>`;
}

function projectsEmptyStateHtml() {
  const phone = projectFilter === "Phone";
  const searched = Boolean(projectQuery.trim());
  const unpairedPhone = phone && !currentState.pairedDevice;
  const title = unpairedPhone ? "Connect iPhone" : phone ? "No iPhone projects yet" : "No projects found";
  const detail = unpairedPhone ? "Pair Vibyra on your iPhone to show mobile projects here."
    : phone ? "Mobile workspaces will appear here."
    : (searched ? "Try another search or switch the project source filter." : "Projects discovered on this desktop will appear here.");
  const mark = `<span>${icon(phone ? "phone" : "search")}</span>`;
  const action = unpairedPhone ? `<button class="projects-empty-action is-primary" type="button" data-projects-pair>${icon("phone")}Pair</button>` : "";
  return `<div class="projects-empty ${phone ? "is-phone" : ""} ${unpairedPhone ? "is-pairing" : ""}">${mark}<strong>${escapeHtml(title)}</strong><p>${escapeHtml(detail)}</p>${action}</div>`;
}
