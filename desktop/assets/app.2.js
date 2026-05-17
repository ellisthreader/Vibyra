function openPairModal() { nodes.pairModal.classList.add("open"); renderPairModal(); }
function closePairModal() { nodes.pairModal.classList.remove("open"); }
function renderPairModal() {
  const pending = currentState.pendingPair && currentState.pendingPair.status === "pending";
  const paired = Boolean(currentState.pairedDevice);
  nodes.pairBody.innerHTML = `<section class="pair-simple"><div class="pair-code-card"><p class="kicker">Pair code</p><div class="pair-code">${escapeHtml(currentState.pairCode || "------")}</div><p class="body-copy">Open Vibyra on your phone and enter this code.</p></div>${pending ? `<div class="nearby-phone-card pending"><span class="nearby-phone-icon">${icon("phone")}</span><div><p class="kicker">Nearby phone</p><h2>${escapeHtml(currentState.pendingPair.deviceName || "Vibyra Phone")}</h2><p class="body-copy">Approve only if this is your phone.</p></div><div class="approval-actions"><button class="danger-button" id="deny-pair" type="button" ${posting ? "disabled" : ""}>Deny</button><button class="primary-button" id="approve-pair" type="button" ${posting ? "disabled" : ""}>Allow</button></div></div>` : `<div class="nearby-phone-card"><span class="nearby-phone-icon">${icon(paired ? "phone" : "search")}</span><span><p class="kicker">${paired ? "Connected phone" : "Nearby phones"}</p><h2>${escapeHtml(paired ? currentState.pairedDevice : "Waiting for phone")}</h2><p class="body-copy">${paired ? "Your phone can use this desktop bridge." : "Pairing requests will appear here automatically."}</p></span></div>`}</section>`;
  document.getElementById("approve-pair")?.addEventListener("click", () => post("/desktop/approve"));
  document.getElementById("deny-pair")?.addEventListener("click", () => post("/desktop/deny"));
}
function openTokenModal() { nodes.tokenModal.classList.add("open"); renderTokenModal(); }
function closeTokenModal() { nodes.tokenModal.classList.remove("open"); }
function renderTokenModal() {
  const user = typeof desktopAuthUser === "function" ? desktopAuthUser() : null;
  const name = user?.name || currentState.desktopAccount?.name || "Desktop account";
  const plan = user?.plan || currentState.desktopAccount?.plan || "free";
  nodes.tokenBody.innerHTML = `<section class="panel welcome"><div><p class="kicker">Account</p><h1>${escapeHtml(name)}</h1><p class="body-copy">This desktop session is only used to verify pairing. Billing, credits, and live account data stay managed by the phone app.</p></div><div class="metric-row"><div class="metric"><strong>${escapeHtml(plan)}</strong><span>plan</span></div><div class="metric"><strong>${currentState.pairedDevice ? "1" : "0"}</strong><span>paired phones</span></div></div></section>`;
}
function sendChat() {
  const input = document.getElementById("chat-input");
  const text = input.value.trim();
  if (!text) return;
  if (text === "/clear" || text === "/new") { chatMessages = []; input.value = ""; renderChat(); return; }
  const project = currentProject();
  const context = project ? `Selected project: ${project.name}. ` : "";
  const files = chatAttachments.length ? `Attached: ${chatAttachments.join(", ")}. ` : "";
  const model = `${chatModels[chatModelIndex]} / ${chatEfforts[chatEffortIndex]} effort. `;
  const reply = text === "/help" ? "Commands available: /help, /clear, /new, /open." : text === "/open" ? "Open a project from the Projects tab or pair a phone to browse folders securely." : `${context}${files}${model}Pair your phone to run this prompt against the local agent bridge with file permissions.`;
  chatMessages.push({ role: "user", text }, { role: "assistant", text: reply });
  chatAttachments = [];
  input.value = "";
  renderChat();
}
function setPage(page) { activePage = page; localStorage.setItem("vibyra.desktop.page", page); render(); }
function bindJumps() { document.querySelectorAll("[data-jump]").forEach((button) => button.addEventListener("click", () => setPage(button.dataset.jump))); }
function pageTitle(page) { return page === "dashboard" ? "Builds" : page === "projects" ? "Projects" : "New chat"; }
function statusTone() {
  if (currentState.pendingPair && currentState.pendingPair.status === "pending") return "warning";
  if (currentState.pendingPair && currentState.pendingPair.status === "denied") return "offline";
  if (currentState.pairedDevice) return "success";
  return "offline";
}
function statusLabel() {
  if (currentState.pendingPair && currentState.pendingPair.status === "pending") return currentState.pairedDevice ? "Connected to phone" : "Not connected";
  if (currentState.pendingPair && currentState.pendingPair.status === "denied") return "Request denied";
  if (currentState.pairedDevice) return "Connected to phone";
  return "Not connected";
}
function statusShortLabel() { return currentState.pendingPair && currentState.pendingPair.status === "pending" ? "Pending" : currentState.pairedDevice ? "Connected" : "Waiting"; }
function filteredProjects() {
  const query = projectQuery.trim().toLowerCase();
  return (currentState.projects || []).filter((project) => {
    const source = String(project.source || "desktop").toLowerCase();
    const filterOk = projectFilter === "All" || (projectFilter === "Desktop" ? source !== "mobile" : source === "mobile");
    const queryOk = !query || [project.name, project.path, project.stack].join(" ").toLowerCase().includes(query);
    return filterOk && queryOk;
  });
}
function summaryTile(iconName, value, label) {
  return `<div class="summary-tile"><span class="summary-icon">${icon(iconName)}</span><div><strong>${escapeHtml(value)}</strong><p>${escapeHtml(label)}</p></div></div>`;
}
function buildRows(rows = liveBuildRows()) {
  return rows.map((item) => `<article class="build-row ${item.isRunning ? "is-running" : ""}"><span class="build-icon ${escapeAttribute(item.tone)}">${icon(item.icon)}</span><div class="build-copy"><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.subtitle)}</p></div><div class="build-state"><span class="build-status ${escapeAttribute(item.tone)}"><span class="status-light"></span>${escapeHtml(item.status)}</span><time class="build-time">${escapeHtml(buildTimeLabel(item))}</time></div><button class="more-button" type="button" aria-label="Build actions">${icon("menu")}</button></article>`).join("");
}
function liveBuildRows() {
  const run = currentState.activeAgentRun || {};
  const runProject = (currentState.projects || []).find((project) => project.id === run.projectId);
  return run.id ? [{
    icon: run.state === "waiting" ? "clock" : "pulse", tone: run.state === "waiting" ? "purple" : "green", status: run.state === "waiting" ? "Waiting" : "Building",
    title: runProject?.name || currentState.latestPreview?.title || "Active build",
    subtitle: run.title || run.file || "Local desktop task",
    startedAt: runStartedAt(run), timeVerb: run.state === "waiting" ? "Waiting" : "Running",
    isRunning: run.state !== "waiting"
  }] : [];
}
function runStartedAt(run) {
  const idTime = Number(String(run.id || "").replace(/\D/g, ""));
  return idTime > 1_000_000_000_000 ? idTime : Date.parse(run.updatedAt || "") || Date.now();
}
function buildTimeLabel(item) {
  return `${item.timeVerb} ${formatDuration(Date.now() - item.startedAt)}`;
}
function formatDuration(ms) {
  const minutes = Math.max(1, Math.floor(ms / 60000));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
}
function emptyBuildState() {
  return `<div class="empty-build"><span class="empty-icon">${icon("pulse")}</span><h2>No active builds</h2><p class="body-copy">Start from Chat when you want Vibyra to work on a project.</p><button class="primary-button" type="button" data-jump="chat">${icon("plus")}New chat</button></div>`;
}
function projectCard(project, index) { const active = selectedProjectId ? selectedProjectId === project.id : index === 0; return `<article class="project-card ${active ? "active" : ""}"><div class="project-top"><div style="display:flex;gap:12px;min-width:0;"><span class="project-icon">${icon("folder")}</span><div><p class="project-name">${escapeHtml(project.name || "Project")}</p><p class="project-path">${escapeHtml(project.path || "")}</p></div></div><span class="tag">${escapeHtml(displayProjectSource(project))}</span></div><div class="project-footer"><span class="body-copy">${escapeHtml(project.stack || "Project")}</span><button class="secondary-button compact-button" type="button" data-project-chat="${escapeAttribute(project.id)}">${icon("chat")}Chat</button></div></article>`; }
function chatEmptyState() { return `<div class="chat-empty"><p class="kicker">Vibyra Desktop</p><h1>What are we building?</h1><p class="body-copy">Ask about a project, attach context, or pair your phone to let Vibyra work on local files.</p><div class="suggestions">${suggestions.map((item) => `<button class="suggestion" type="button" data-suggestion="${escapeAttribute(item.prompt)}"><span class="action-icon">${icon(item.icon)}</span><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.description)}</p></button>`).join("")}</div></div>`; }
function messageRow(message) { const assistant = message.role === "assistant"; return `<div class="message ${assistant ? "assistant" : "user"}"><div class="avatar">${assistant ? "V" : "U"}</div><div><div class="message-author">${assistant ? "Vibyra AI" : "You"}</div><div class="message-body">${escapeHtml(message.text)}</div></div></div>`; }
function eventRows(events) { if (!events.length) return `<div class="empty">Nothing yet.</div>`; return events.map((event) => `<div class="event-row"><span class="event-dot" style="background:${toneColor(event.tone)}"></span><div><p class="event-message">${escapeHtml(event.message || "Desktop event")}</p><p class="event-source">${escapeHtml(event.source || "Desktop")}</p></div></div>`).join(""); }
function toneColor(tone) { return tone === "success" ? "#37D67A" : tone === "warning" ? "#FFB347" : tone === "error" ? "#FF5D7A" : "#6D3BFF"; }
function icon(name) {
  const paths = {
    grid: '<path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z"/>',
    home: '<path d="m4 11 8-7 8 7v9H6v-7h4v7h8v-9"/>',
    folder: '<path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H10l2 2h6.5A2.5 2.5 0 0 1 21 9.5v7A2.5 2.5 0 0 1 18.5 19h-13A2.5 2.5 0 0 1 3 16.5z"/>',
    chat: '<path d="M5 5h14v10H8l-4 4V6a1 1 0 0 1 1-1z"/>',
    people: '<path d="M8.5 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM15.5 11a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM3 20a5.5 5.5 0 0 1 11 0zM13 20a4.5 4.5 0 0 1 8 0z"/>',
    phone: '<path d="M8 3h8a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM10 18h4"/>',
    user: '<path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0z"/>',
    link: '<path d="M10 13a5 5 0 0 0 7.1 0l2-2a5 5 0 0 0-7.1-7.1l-1.1 1.1M14 11a5 5 0 0 0-7.1 0l-2 2A5 5 0 0 0 12 20.1l1.1-1.1"/>',
    copy: '<path d="M8 8h11v11H8zM5 16H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1"/>',
    menu: '<path d="M12 5h.01M12 12h.01M12 19h.01"/>',
    pulse: '<path d="M3 12h4l3-7 4 14 3-7h4"/>',
    clock: '<path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v6l4 2"/>',
    bolt: '<path d="M13 2 4 14h7l-1 8 10-13h-7z"/>',
    desktop: '<path d="M3 5h18v12H3zM9 21h6M12 17v4"/>',
    search: '<path d="M10.5 18a7.5 7.5 0 1 1 5.3-12.8A7.5 7.5 0 0 1 10.5 18zM16 16l5 5"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    chevron: '<path d="m9 6 6 6-6 6"/>',
    "chevron-down": '<path d="m6 9 6 6 6-6"/>',
    sparkles: '<path d="M12 2l1.7 5.3L19 9l-5.3 1.7L12 16l-1.7-5.3L5 9l5.3-1.7zM5 15l.8 2.2L8 18l-2.2.8L5 21l-.8-2.2L2 18l2.2-.8z"/>',
    card: '<path d="M3 6h18v12H3zM3 10h18"/>',
    tool: '<path d="M14 6a4 4 0 0 0 4 4l-8 8-4-4 8-8zM6 14l4 4"/>',
    cube: '<path d="M12 2 4 6v12l8 4 8-4V6zM4 6l8 4 8-4M12 10v12"/>',
    code: '<path d="m8 8-4 4 4 4M16 8l4 4-4 4M14 5l-4 14"/>',
    rocket: '<path d="M12 15 9 12c1-5 4-8 10-9-1 6-4 9-9 10zM9 12l-4 1-2 5 5-2 1-4zM15 6h.01"/>',
    paperclip: '<path d="M7 12.5 13.5 6a4 4 0 0 1 5.7 5.7l-8 8A5 5 0 0 1 4.1 12.6l8-8"/>',
    send: '<path d="M12 19V5M5 12l7-7 7 7"/>',
    close: '<path d="M6 6l12 12M18 6 6 18"/>',
    diamond: '<path d="M12 3 21 9l-9 12L3 9z"/>',
    calendar: '<path d="M5 4h14v16H5zM8 2v4M16 2v4M5 9h14"/>',
    palette: '<path d="M12 3a9 9 0 0 0 0 18h1.5a2 2 0 0 0 1.5-3.3 1.5 1.5 0 0 1 1.1-2.7H18a6 6 0 0 0 0-12zM7.5 10h.01M10 7h.01M14 7h.01M16.5 10h.01"/>',
    logout: '<path d="M10 5H5v14h5M14 8l4 4-4 4M18 12H9"/>'
  };
  return `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${paths[name] || paths.sparkles}</svg>`;
}
function escapeHtml(value) { return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char])); }
function escapeAttribute(value) { return escapeHtml(value).replace(/`/g, "&#096;"); }
function displayProjectSource(project) { return String(project.source || "desktop").toLowerCase() === "mobile" ? "Phone" : "Desktop"; }
function currentProject() { return (currentState.projects || []).find((project) => project.id === selectedProjectId) || null; }
function bindProjectActions() {
  document.querySelectorAll("[data-project-chat]").forEach((button) => button.addEventListener("click", () => {
    const project = (currentState.projects || []).find((item) => item.id === button.dataset.projectChat);
    if (!project) return;
    selectedProjectId = project.id;
    localStorage.setItem("vibyra.desktop.project", selectedProjectId);
    chatMessages.push({ role: "assistant", text: `Project selected: ${project.name}. Ask me what to build or type /open for folder guidance.` });
    setPage("chat");
  }));
}
function bindChatTools() {
  document.getElementById("attach-chat")?.addEventListener("click", () => document.getElementById("chat-attach")?.click());
  document.getElementById("chat-attach")?.addEventListener("change", (event) => {
    chatAttachments = Array.from(event.target.files || []).map((file) => file.name).slice(0, 6);
    if (chatAttachments.length) chatMessages.push({ role: "assistant", text: `${chatAttachments.length} attachment${chatAttachments.length === 1 ? "" : "s"} staged for this chat.` });
    renderChat();
  });
  document.getElementById("cycle-effort")?.addEventListener("click", () => { chatEffortIndex = (chatEffortIndex + 1) % chatEfforts.length; renderChat(); });
  document.getElementById("cycle-model")?.addEventListener("click", () => { chatModelIndex = (chatModelIndex + 1) % chatModels.length; renderChat(); });
}
