function icon(name) {
  const paths = {
    grid: '<path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z"/>',
    home: '<path d="m4 11 8-7 8 7v9H6v-7h4v7h8v-9"/>',
    folder: '<path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H10l2 2h6.5A2.5 2.5 0 0 1 21 9.5v7A2.5 2.5 0 0 1 18.5 19h-13A2.5 2.5 0 0 1 3 16.5z"/>',
    "folder-plus": '<path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H10l2 2h6.5A2.5 2.5 0 0 1 21 9.5v7A2.5 2.5 0 0 1 18.5 19h-13A2.5 2.5 0 0 1 3 16.5zM12 10v6M9 13h6"/>',
    chat: '<path d="M5 5h14v10H8l-4 4V6a1 1 0 0 1 1-1z"/>',
    people: '<path d="M8.5 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM15.5 11a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM3 20a5.5 5.5 0 0 1 11 0zM13 20a4.5 4.5 0 0 1 8 0z"/>',
    teamwork: '<circle cx="12" cy="6" r="2.5"/><circle cx="6" cy="17" r="2.5"/><circle cx="18" cy="17" r="2.5"/><path d="m10.8 8.2-3.6 6.6M13.2 8.2l3.6 6.6M8.5 17h7"/>',
    phone: '<path d="M8 3h8a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM10 18h4"/>',
    user: '<path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0z"/>',
    link: '<path d="M10 13a5 5 0 0 0 7.1 0l2-2a5 5 0 0 0-7.1-7.1l-1.1 1.1M14 11a5 5 0 0 0-7.1 0l-2 2A5 5 0 0 0 12 20.1l1.1-1.1"/>',
    network: '<circle cx="12" cy="12" r="2.5"/><circle cx="5" cy="5" r="1.5"/><circle cx="19" cy="5" r="1.5"/><circle cx="5" cy="19" r="1.5"/><circle cx="19" cy="19" r="1.5"/><path d="m6.2 6.2 4 4M17.8 6.2l-4 4M6.2 17.8l4-4M17.8 17.8l-4-4"/>',
    copy: '<path d="M8 8h11v11H8zM5 16H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1"/>',
    menu: '<path d="M12 5h.01M12 12h.01M12 19h.01"/>',
    pulse: '<path d="M3 12h4l3-7 4 14 3-7h4"/>',
    clock: '<path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v6l4 2"/>',
    bolt: '<path d="M13 2 4 14h7l-1 8 10-13h-7z"/>',
    desktop: '<path d="M3 5h18v12H3zM9 21h6M12 17v4"/>',
    terminal: '<path d="M4 5h16v14H4zM8 9l3 3-3 3M13 15h4"/>',
    "image-stack": '<path d="M5 6h14v12H5zM8 10h.01M5 16l4-4 3 3 2-2 5 5M3 10V4h13"/>',
    image: '<path d="M4 5h16v14H4zM8 10h.01M4 17l5-5 4 4 2-2 5 5"/>',
    globe: '<path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM3.6 9h16.8M3.6 15h16.8M12 3c2 2.4 3 5.4 3 9s-1 6.6-3 9M12 3c-2 2.4-3 5.4-3 9s1 6.6 3 9"/>',
    document: '<path d="M6 3h8l4 4v14H6zM14 3v5h5M9 13h6M9 17h6"/>',
    play: '<path d="M8 5v14l11-7z"/>',
    help: '<path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM9.8 9a2.4 2.4 0 0 1 4.6 1c0 1.8-2.4 2-2.4 3.6M12 17h.01"/>',
    alert: '<path d="M12 9v4M12 17h.01M10.3 4.3 2.6 18a2 2 0 0 0 1.7 3h15.4a2 2 0 0 0 1.7-3L13.7 4.3a2 2 0 0 0-3.4 0z"/>',
    search: '<path d="M10.5 18a7.5 7.5 0 1 1 5.3-12.8A7.5 7.5 0 0 1 10.5 18zM16 16l5 5"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    refresh: '<path d="M20 7v5h-5M4 17v-5h5M18.4 9A7 7 0 0 0 6.2 6.7L4 9M5.6 15A7 7 0 0 0 17.8 17.3L20 15"/>',
    "rotate-device": '<rect x="8" y="3" width="8" height="13" rx="1.5"/><path d="M5 10a8 8 0 0 0 13.2 6L20 14M20 14v5h-5M11 13h2"/>',
    chevron: '<path d="m9 6 6 6-6 6"/>',
    "chevron-down": '<path d="m6 9 6 6 6-6"/>',
    sparkles: '<path d="M12 2l1.7 5.3L19 9l-5.3 1.7L12 16l-1.7-5.3L5 9l5.3-1.7zM5 15l.8 2.2L8 18l-2.2.8L5 21l-.8-2.2L2 18l2.2-.8z"/>',
    card: '<path d="M3 6h18v12H3zM3 10h18"/>',
    lock: '<path d="M7 11V8a5 5 0 0 1 10 0v3M6 11h12v10H6z"/>',
    tool: '<path d="M14 6a4 4 0 0 0 4 4l-8 8-4-4 8-8zM6 14l4 4"/>',
    cube: '<path d="M12 2 4 6v12l8 4 8-4V6zM4 6l8 4 8-4M12 10v12"/>',
    code: '<path d="m8 8-4 4 4 4M16 8l4 4-4 4M14 5l-4 14"/>',
    rocket: '<path d="M12 15 9 12c1-5 4-8 10-9-1 6-4 9-9 10zM9 12l-4 1-2 5 5-2 1-4zM15 6h.01"/>',
    paperclip: '<path d="M7 12.5 13.5 6a4 4 0 0 1 5.7 5.7l-8 8A5 5 0 0 1 4.1 12.6l8-8"/>',
    send: '<path d="M12 19V5M5 12l7-7 7 7"/>',
    close: '<path d="M6 6l12 12M18 6 6 18"/>',
    pin: '<path d="M12 17v5M7 17h10M9 3h6l1 7 3 3v4H5v-4l3-3z"/>',
    archive: '<path d="M4 7h16M6 7v12h12V7M9 11h6M5 3h14l1 4H4z"/>',
    edit: '<path d="M4 20h4l11-11-4-4L4 16zM13 7l4 4"/>',
    share: '<path d="M12 5v10M8 9l4-4 4 4M5 13v6h14v-6"/>',
    import: '<path d="M12 3v11M8 10l4 4 4-4M5 16v4h14v-4"/>',
    download: '<path d="M12 3v12M7 10l5 5 5-5M5 20h14"/>',
    preview: '<path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z"/>',
    split: '<path d="M4 4h16v16H4zM10 4v16M14 9l2-2 2 2M18 15l-2 2-2-2"/>',
    sidebar: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M15 4v16M7 8h4M7 12h4M7 16h4"/>',
    trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 14h10l1-14M9 7V4h6v3"/>',
    diamond: '<path d="M12 3 21 9l-9 12L3 9z"/>',
    calendar: '<path d="M5 4h14v16H5zM8 2v4M16 2v4M5 9h14"/>',
    minus: '<path d="M5 12h14"/>',
    square: '<path d="M7 7h10v10H7z"/>',
    expand: '<path d="M9 4H4v5M15 4h5v5M9 20H4v-5M15 20h5v-5"/>',
    contract: '<path d="M9 9H4V4M15 9h5V4M9 15H4v5M15 15h5v5"/>',
    palette: '<path d="M12 3a9 9 0 0 0 0 18h1.5a2 2 0 0 0 1.5-3.3 1.5 1.5 0 0 1 1.1-2.7H18a6 6 0 0 0 0-12zM7.5 10h.01M10 7h.01M14 7h.01M16.5 10h.01"/>',
    moon: '<path d="M21 14.5A8.5 8.5 0 0 1 9.5 3 7 7 0 1 0 21 14.5z"/>',
    sun: '<path d="M12 4V2M12 22v-2M4.9 4.9 3.5 3.5M20.5 20.5l-1.4-1.4M4 12H2M22 12h-2M4.9 19.1l-1.4 1.4M20.5 3.5l-1.4 1.4M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10z"/>',
    contrast: '<path d="M12 21a9 9 0 1 0 0-18v18z"/>',
    check: '<path d="M5 12.5 10 17l9-10"/>',
    shield: '<path d="M12 3 19 6v5c0 4.4-2.8 8.1-7 10-4.2-1.9-7-5.6-7-10V6z"/><path d="m9 12 2 2 4-5"/>',
    logout: '<path d="M10 5H5v14h5M14 8l4 4-4 4M18 12H9"/>'
  };
  return `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${paths[name] || paths.sparkles}</svg>`;
}
function escapeHtml(value) { return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char])); }
function escapeAttribute(value) { return escapeHtml(value).replace(/`/g, "&#096;"); }
function displayProjectSource(project) { return String(project.source || "desktop").toLowerCase() === "mobile" ? "Phone" : "Desktop"; }
function currentProject() { return (currentState.projects || []).find((project) => project.id === selectedProjectId) || null; }
function openProjectInTerminalSetup(projectId = "") {
  const project = (currentState.projects || []).find((item) => item.id === projectId);
  selectedProjectId = project?.id || "";
  if (selectedProjectId) {
    localStorage.setItem("vibyra.desktop.project", selectedProjectId);
    if (typeof setupProjectId !== "undefined") setupProjectId = selectedProjectId;
    if (typeof setupProjectKey !== "undefined") localStorage.setItem(setupProjectKey, selectedProjectId);
  } else {
    localStorage.removeItem("vibyra.desktop.project");
    if (typeof setupProjectId !== "undefined") setupProjectId = "";
    if (typeof setupProjectKey !== "undefined") localStorage.removeItem(setupProjectKey);
  }
  if (typeof resetTerminalSetupFlow === "function") resetTerminalSetupFlow();
  if (typeof openTerminalBatchSetup === "function" && typeof terminals !== "undefined" && Array.isArray(terminals) && terminals.length) {
    openTerminalBatchSetup(selectedProjectId, 1);
    return;
  }
  if (typeof forceTerminalRender !== "undefined") forceTerminalRender = true;
  setPage("terminals");
}
function bindProjectActions() {
  document.querySelectorAll("[data-project-terminal]").forEach((button) => button.addEventListener("click", () => {
    openProjectInTerminalSetup(button.dataset.projectTerminal || "");
  }));
}
function bindChatTools() {
  document.getElementById("chat-attach")?.addEventListener("change", (event) => {
    void stageChatAttachmentFiles(event.target.files);
  });
}
function bindGeneratedAppCards() {
  document.querySelectorAll("[data-open-app]").forEach((button) => button.addEventListener("click", () => openGeneratedApp(button.dataset.openApp)));
}
function openGeneratedApp(index) {
  const app = normalizeChatApp(chatMessages[Number(index)]?.app);
  if (!app) return;
  if (app.url) {
    window.open(app.url, "_blank", "noopener");
    return;
  }
  if (app.html) {
    const url = URL.createObjectURL(new Blob([app.html], { type: "text/html" }));
    window.open(url, "_blank", "noopener");
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }
}
