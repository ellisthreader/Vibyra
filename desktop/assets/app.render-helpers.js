function setPage(page) { activePage = page; topbarChatMenuOpen = false; localStorage.setItem("vibyra.desktop.page", page); render(); }
function bindJumps() { document.querySelectorAll("[data-jump]").forEach((button) => button.addEventListener("click", () => setPage(button.dataset.jump))); }
function pageTitle(page) { return page === "dashboard" ? "Builds" : page === "projects" ? "Projects" : page === "terminals" ? "Terminals" : page === "profile" ? "Profile" : "New chat"; }
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
  return `<div class="empty-build"><span class="empty-icon">${icon("pulse")}</span><h2>No active builds</h2><p class="body-copy">Phone-started build work appears here when it is running on this desktop.</p><button class="primary-button" type="button" data-jump="chat">${icon("plus")}New chat</button></div>`;
}
function dashboardSummaryTile(iconName, label, value, detail, hasArrow = false) {
  return `<article class="summary-tile dashboard-summary-tile"><span class="summary-icon">${icon(iconName)}</span><div class="dashboard-summary-copy"><p>${escapeHtml(label)}</p><strong>${escapeHtml(value)}</strong><span>${escapeHtml(detail)}</span></div>${hasArrow ? `<span class="summary-arrow">${icon("chevron")}</span>` : ""}</article>`;
}
function desktopStatusTitle() {
  if (currentState.pendingPair?.status === "pending") return "Approval needed";
  if (currentState.pairedDevice) return "Connected to phone";
  return "Ready, waiting for phone";
}
function desktopChromeStatusText() {
  if (currentState.pendingPair?.status === "pending") return "Approval needed";
  if (currentState.pairedDevice) return "Ready • Connected to phone";
  return "Ready • Waiting for phone";
}
function dashboardActiveBuildPanel(rows) {
  return `<section class="live-builds dashboard-live-builds"><div class="builds-head"><h2>Current work</h2><button class="text-link" type="button" data-jump="chat">New chat ${icon("arrow")}</button></div><div class="build-list">${buildRows(rows)}</div></section>`;
}
function dashboardPairingPanel() {
  const code = currentState.pairCode || "------";
  return `<section class="dashboard-pair-panel"><div class="dashboard-pair-visual" aria-hidden="true"><div class="dashboard-pair-orb"><span class="pair-phone-shape"></span><span class="pair-dash pair-dash-left"></span><span class="pair-vibyra-mark">${icon("pulse")}</span><span class="pair-dash pair-dash-right"></span><span class="pair-laptop-shape"><i></i></span></div></div><div class="dashboard-pair-divider"></div><div class="dashboard-pair-copy"><h2>${currentState.pairedDevice ? "Phone connected" : "Waiting for phone connection"}</h2><p>Pair your phone to start build work on this desktop.</p><label>Pair code</label><div class="dashboard-code-row"><strong>${escapeHtml(code)}</strong><button class="secondary-button" type="button" id="copy-dashboard-pair-code">${icon("copy")}<span class="copy-label">Copy code</span><span class="copied-label">Copied</span></button></div><div class="dashboard-pair-actions"><button class="primary-button" type="button" id="dashboard-pair-phone">${icon("phone")}Pair phone</button><button class="secondary-button" type="button" id="dashboard-pair-help">${icon("arrow")}View pairing instructions</button></div><p class="dashboard-pair-note">${icon("shield")}Builds started from your phone will appear here once running.</p></div></section>`;
}
function dashboardActivityEvents() {
  const events = [...(currentState.events || [])];
  const account = currentState.desktopAccount;
  if (account && !events.some((event) => String(event.source || "").toLowerCase() === "account")) {
    const name = account.name || account.email || "Account";
    events.push({ id: "desktop-account-session", source: "Account", message: `${name} signed in on Vibyra Desktop`, tone: "success", time: "Just now" });
  }
  return events;
}
function dashboardActivityRows(events) {
  if (!events.length) return `<div class="empty dashboard-empty-activity">Nothing yet.</div>`;
  return events.map((event) => `<article class="event-row dashboard-event-row"><span class="dashboard-event-icon ${escapeAttribute(eventToneClass(event))}">${icon(eventIconName(event))}</span><div class="dashboard-event-copy"><p class="event-message">${escapeHtml(event.message || "Desktop event")}</p><span class="dashboard-event-tag ${escapeAttribute(eventToneClass(event))}">${escapeHtml(event.source || "Desktop")}</span></div><time>${escapeHtml(dashboardEventTime(event))}</time></article>`).join("");
}
function eventIconName(event) {
  const source = String(event.source || "").toLowerCase();
  if (source.includes("pair")) return "link";
  if (source.includes("account")) return "user";
  if (event.tone === "error") return "alert";
  return event.tone === "warning" ? "clock" : "check";
}
function eventToneClass(event) {
  if (event.tone === "error") return "danger";
  if (event.tone === "warning") return "warning";
  if (event.tone === "success") return "success";
  return "purple";
}
function dashboardEventTime(event) {
  if (event.time && event.time !== "Now") return event.time;
  const explicit = Date.parse(event.createdAt || "");
  const idTime = Number(String(event.id || "").match(/evt-(\d+)/)?.[1] || 0);
  const started = Number.isFinite(explicit) ? explicit : idTime;
  if (!started) return "Just now";
  const minutes = Math.floor((Date.now() - started) / 60000);
  if (minutes <= 0) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}
function projectCard(project, index) { const active = selectedProjectId ? selectedProjectId === project.id : index === 0; return `<article class="project-card ${active ? "active" : ""}"><div class="project-top"><div style="display:flex;gap:12px;min-width:0;"><span class="project-icon">${icon("folder")}</span><div><p class="project-name">${escapeHtml(project.name || "Project")}</p><p class="project-path">${escapeHtml(project.path || "")}</p></div></div><span class="tag">${escapeHtml(displayProjectSource(project))}</span></div><div class="project-footer"><span class="body-copy">${escapeHtml(project.stack || "Project")}</span><button class="secondary-button compact-button" type="button" data-project-chat="${escapeAttribute(project.id)}">${icon("chat")}Chat</button></div></article>`; }
function chatEmptyState() { const project = currentProject(); const title = typeof vibyraChatEmptyTitle === "function" ? vibyraChatEmptyTitle() : "How can I help today?"; return `<div class="chat-empty">${project ? `<p class="kicker">${escapeHtml(project.name)}</p>` : ""}<h1>${escapeHtml(title)}</h1><div class="suggestions">${suggestions.map((item) => `<button class="suggestion" type="button" data-suggestion="${escapeAttribute(item.prompt)}"><span class="action-icon">${icon(item.icon)}</span><span>${escapeHtml(item.title)}</span></button>`).join("")}</div></div>`; }
function chatNoticeBanner() {
  if (!chatNotice) return "";
  const resetLabel = chatNotice.resetAt ? formatResetTime(chatNotice.resetAt) : "";
  const reset = resetLabel ? `<time>${escapeHtml(resetLabel)}</time>` : "";
  return `<aside class="chat-limit-notice" role="status"><span class="chat-limit-icon">${icon("alert")}</span><div><strong>${escapeHtml(chatNotice.title || "AI limit reached")}</strong><p>${escapeHtml(chatNotice.message || "Try again later.")}</p>${reset}</div><button id="dismiss-chat-notice" type="button" aria-label="Dismiss notice">${icon("close")}</button></aside>`;
}
function formatResetTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `Resets ${date.toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}`;
}
function messageRow(message, index) {
  const assistant = message.role === "assistant";
  const image = normalizeChatImage(message.image);
  const app = normalizeChatApp(message.app);
  const avatar = assistant ? `<span class="message-avatar" aria-hidden="true"><img src="/app-assets/vibyra.png" alt="" /></span>` : "";
  return `<div class="message ${assistant ? "assistant" : "user"}">${avatar}<div class="message-card"><div class="message-author">${assistant ? "Vibyra" : "You"}</div><div class="message-body">${escapeHtml(message.text)}</div>${image ? `<figure class="generated-image-card"><img src="${escapeAttribute(image.url)}" alt="${escapeAttribute(image.title)}" /><figcaption><strong>${escapeHtml(image.title)}</strong>${image.provider ? `<span>${escapeHtml(image.provider)}</span>` : ""}</figcaption></figure>` : ""}${app ? `<figure class="generated-app-card"><figcaption><span>${icon("code")}</span><strong>${escapeHtml(app.title)}</strong><button type="button" data-open-app="${index}">${icon("play")}Open</button></figcaption></figure>` : ""}</div></div>`;
}
function projectContextChip() { const project = currentProject(); return project ? `<span class="context-chip project-chip">${icon("folder")}<span>${escapeHtml(project.name || "Project")}</span><button id="clear-project" type="button" aria-label="Remove project">${icon("close")}</button></span>` : ""; }
function attachmentChips() { return chatAttachments.length ? `<span class="context-chip">${icon("paperclip")}<span>${chatAttachments.length} file${chatAttachments.length === 1 ? "" : "s"}</span><button id="clear-attachments" type="button" aria-label="Clear attachments">${icon("close")}</button></span>` : ""; }
function toolChip() {
  const tool = chatAttachmentTools.find((item) => item.tool === activeChatTool);
  return tool ? `<span class="context-chip tool-chip">${icon(tool.icon)}<span>${escapeHtml(tool.label)}</span><button id="clear-tool" type="button" aria-label="Clear tool">${icon("close")}</button></span>` : "";
}
function skillChip() {
  const skill = selectedSkill();
  return skill ? `<span class="context-chip skill-chip">${icon(skill.icon || "sparkles")}<span>${escapeHtml(skill.label)}</span><button id="clear-skill" type="button" aria-label="Clear skill">${icon("close")}</button></span>` : "";
}
function slashMenu() {
  const match = chatDraft.match(/^\/(\w*)$/);
  if (!match) return "";
  const query = match[1].toLowerCase();
  const commands = chatSlashCommands.filter((item) => !query || item.id.includes(query) || item.label.toLowerCase().includes(query) || item.slash.includes(`/${query}`));
  const skills = chatSkills.filter((item) => !query || item.id.includes(query) || item.label.toLowerCase().includes(query) || item.slash.includes(`/${query}`));
  if (!commands.length && !skills.length) return "";
  return `<div class="slash-menu"><section>${commands.map((command) => `<button type="button" data-slash-command="${escapeAttribute(command.id)}">${icon(command.icon)}<span><strong>${escapeHtml(command.slash)} <b>${escapeHtml(command.label)}</b></strong><small>${escapeHtml(command.description)}</small></span></button>`).join("")}</section><section>${skills.map((skill) => `<button type="button" data-slash-skill="${escapeAttribute(skill.id)}">${icon(skill.icon || "sparkles")}<span><strong>${escapeHtml(skill.slash)} <b>${escapeHtml(skill.label)}</b></strong><small>${escapeHtml(skill.description)}</small></span></button>`).join("")}</section></div>`;
}
function activeRunCard() {
  const item = liveBuildRows()[0];
  if (!item) return "";
  return `<article class="run-card ${item.isRunning ? "is-running" : ""}"><span class="run-icon">${icon(item.icon)}</span><div><p class="run-label">${escapeHtml(item.status)}</p><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.subtitle)}</p></div><time>${escapeHtml(buildTimeLabel(item))}</time></article>`;
}
function eventRows(events) { if (!events.length) return `<div class="empty">Nothing yet.</div>`; return events.map((event) => `<div class="event-row"><span class="event-dot" style="background:${toneColor(event.tone)}"></span><div><p class="event-message">${escapeHtml(event.message || "Desktop event")}</p><p class="event-source">${escapeHtml(event.source || "Desktop")}</p></div></div>`).join(""); }
function toneColor(tone) { return tone === "success" ? "#37D67A" : tone === "warning" ? "#FFB347" : tone === "error" ? "#FF5D7A" : "#6D3BFF"; }
