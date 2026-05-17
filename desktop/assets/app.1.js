const emptyState = { machineName: "Vibyra Desktop", pairCode: "------", pairedDevice: null, pendingPair: null, latestPreview: null, events: [], projects: [], connectionUrls: [] };
const pages = [
  { key: "chat", label: "Chat", icon: "chat" },
  { key: "projects", label: "Projects", icon: "folder" },
  { key: "dashboard", label: "Builds", icon: "pulse" }
];
const suggestions = [
  { title: "Fix a bug", description: "Find and resolve issues", icon: "tool", prompt: "Find and fix the main bug in this project." },
  { title: "Build a feature", description: "Add something new", icon: "cube", prompt: "Build a new feature for this project." },
  { title: "Refactor code", description: "Improve code quality", icon: "code", prompt: "Refactor this project and improve the code quality." },
  { title: "Open a folder", description: "Use your paired phone", icon: "folder", prompt: "/open" }
];
const projectFilterModes = ["All", "Desktop", "Phone"];
const chatModels = ["GPT-5.5", "Claude", "Gemini"];
const chatEfforts = ["Low", "Med", "High"];
const storedPage = localStorage.getItem("vibyra.desktop.page");
let currentState = emptyState;
let activePage = pages.some((page) => page.key === storedPage) ? storedPage : "chat";
let projectQuery = "";
let projectFilter = "All";
let posting = false;
let chatMessages = [];
let chatAttachments = [];
let chatModelIndex = 0;
let chatEffortIndex = 1;
let selectedProjectId = localStorage.getItem("vibyra.desktop.project") || "";
let openedPairRequestId = "";
const nodes = {
  content: document.getElementById("content"),
  mobileDock: document.getElementById("mobile-dock"),
  pairBody: document.getElementById("pair-modal-body"),
  pairModal: document.getElementById("pair-modal"),
  railNav: document.getElementById("rail-nav"),
  railStatus: document.getElementById("rail-status"),
  tokenBody: document.getElementById("token-modal-body"),
  tokenModal: document.getElementById("token-modal"),
  topbar: document.getElementById("topbar")
};
document.getElementById("close-pair").innerHTML = icon("close");
document.getElementById("close-token").innerHTML = icon("close");
document.getElementById("close-pair").addEventListener("click", closePairModal);
document.getElementById("close-token").addEventListener("click", closeTokenModal);
nodes.pairModal.addEventListener("click", (event) => { if (event.target === nodes.pairModal) closePairModal(); });
nodes.tokenModal.addEventListener("click", (event) => { if (event.target === nodes.tokenModal) closeTokenModal(); });
renderNav();
refresh();
setInterval(refresh, 1000);

async function refresh() {
  try {
    const response = await fetch("/desktop/state", { cache: "no-store" });
    if (!response.ok) throw new Error("Desktop state failed");
    currentState = { ...emptyState, ...(await response.json()) };
    openPendingPairRequest();
    render();
  } catch (error) {
    currentState = { ...currentState, events: [{ source: "Desktop", message: error instanceof Error ? error.message : "Could not load desktop state", tone: "error" }] };
    render();
  }
}
function openPendingPairRequest() {
  const pair = currentState.pendingPair;
  if (!pair || pair.status !== "pending" || pair.id === openedPairRequestId) return;
  openedPairRequestId = pair.id;
  openPairModal();
}
async function post(path) {
  if (posting) return;
  posting = true;
  renderPairModal();
  try {
    const response = await fetch(path, { method: "POST" });
    if (!response.ok) throw new Error("Desktop action failed");
    currentState = { ...emptyState, ...(await response.json()) };
    render();
  } catch (error) {
    currentState = { ...currentState, events: [{ source: "Desktop", message: error instanceof Error ? error.message : "Desktop action failed", tone: "error" }, ...(currentState.events || [])] };
    render();
  } finally {
    posting = false;
    renderPairModal();
  }
}
function render() {
  if (!pages.some((page) => page.key === activePage)) activePage = "chat";
  renderNav();
  renderTopbar();
  nodes.content.className = activePage === "chat" ? "content chat-content" : "content";
  if (activePage === "chat") renderChat();
  if (activePage === "projects") renderProjects();
  if (activePage === "dashboard") renderDashboard();
  renderRailStatus();
  if (nodes.pairModal.classList.contains("open")) renderPairModal();
  if (nodes.tokenModal.classList.contains("open")) renderTokenModal();
}
function renderNav() {
  const html = pages.map((page) => `<button class="nav-button ${activePage === page.key ? "active" : ""}" type="button" data-page="${page.key}">${icon(page.icon)}<span>${escapeHtml(page.label)}</span></button>`).join("");
  nodes.railNav.innerHTML = html;
  nodes.mobileDock.innerHTML = html;
  document.querySelectorAll("[data-page]").forEach((button) => button.addEventListener("click", () => setPage(button.dataset.page)));
}
function renderTopbar() {
  const user = typeof desktopAuthUser === "function" ? desktopAuthUser() : null;
  const accountLabel = user?.name || "Account";
  const accountMeta = user ? "Desktop session" : "Sign in";
  const selected = currentProject();
  const projectCount = filteredProjects().length;
  const subtitle = activePage === "chat"
    ? selected ? selected.name : "Local desktop bridge"
    : activePage === "projects"
      ? `${projectCount} project${projectCount === 1 ? "" : "s"}`
      : statusLabel();
  nodes.topbar.innerHTML = `<div class="top-title"><h1>${escapeHtml(pageTitle(activePage))}</h1><p>${escapeHtml(subtitle)}</p></div><div class="top-actions"><button class="connection-chip" type="button" id="open-pair"><span class="dot ${statusTone() === "success" ? "" : statusTone()}"></span>${escapeHtml(statusLabel())}</button>${activePage === "chat" ? `<button class="icon-button" id="clear-chat" type="button" aria-label="New chat">${icon("plus")}</button>` : ""}<button class="token-pill" id="open-token" type="button">${icon("user")}<span><strong>${escapeHtml(accountLabel)}</strong><span>${escapeHtml(accountMeta)}</span></span></button></div>`;
  document.getElementById("open-pair")?.addEventListener("click", openPairModal);
  document.getElementById("open-token")?.addEventListener("click", openTokenModal);
  document.getElementById("clear-chat")?.addEventListener("click", () => { chatMessages = []; renderChat(); });
}
function renderRailStatus() {
  const paired = Boolean(currentState.pairedDevice);
  const pending = currentState.pendingPair && currentState.pendingPair.status === "pending";
  nodes.railStatus.innerHTML = `<button class="rail-status-card ${pending ? "pending" : ""}" type="button" id="rail-pair"><span class="rail-status-top"><span class="dot ${pending ? "warning" : paired ? "" : "offline"}"></span><span>${pending ? "Approval needed" : statusLabel()}</span></span><span class="rail-status-main"><span class="rail-phone-icon">${icon(pending ? "clock" : paired ? "phone" : "link")}</span><span><strong>${pending ? "Review pairing" : paired ? "Phone connected" : "Pair phone"}</strong><small>${pending ? "A phone is waiting for access." : paired ? currentState.pairedDevice : "Connect to browse and build."}</small></span></span></button>`;
  document.getElementById("rail-pair")?.addEventListener("click", openPairModal);
}
function renderDashboard() {
  const rows = liveBuildRows();
  const events = currentState.events || [];
  nodes.content.innerHTML = `<section class="builds-page"><div class="page-head"><p class="kicker">Active builds</p><h1>Builds on this desktop</h1><p class="body-copy">Running and waiting agent work appears here using real desktop state.</p></div><div class="summary-grid">${summaryTile("pulse", rows.length, "active builds")}${summaryTile("folder", (currentState.projects || []).length, "local projects")}${summaryTile("desktop", currentState.machineName || "Desktop", statusShortLabel())}</div><section class="live-builds"><div class="builds-head"><h2>Current work</h2><button class="text-link" type="button" data-jump="chat">New chat ${icon("arrow")}</button></div><div class="build-list">${rows.length ? buildRows(rows) : emptyBuildState()}</div></section><section class="activity-panel"><div class="activity-head"><h2>Recent activity</h2><span class="activity-count">${events.length}</span></div><div class="activity-list">${eventRows(events.slice(0, 8))}</div></section></section>`;
  bindJumps();
}
function renderProjects() {
  const projects = filteredProjects();
  const phonePrompt = currentState.pairedDevice ? "" : `<div class="projects-phone-prompt"><div class="projects-phone-panel"><span class="projects-phone-icon">${icon("folder")}</span><h2>Need desktop access?</h2><p>Pair your phone to approve browsing and agent work on this computer.</p><button class="projects-phone-link" type="button" id="projects-pair-phone">Pair phone ${icon("arrow")}</button></div></div>`;
  nodes.content.innerHTML = `<section class="projects-page"><div class="toolbar"><button class="primary-button" type="button" id="create-project">${icon("plus")}New chat</button><button class="secondary-button" type="button" id="browse-desktop">${icon("link")}Pair phone</button><label class="search">${icon("search")}<input id="project-search" placeholder="Search projects" value="${escapeAttribute(projectQuery)}" /></label><div class="filter-row">${projectFilterModes.map((mode) => `<button class="chip ${projectFilter === mode ? "active" : ""}" data-filter="${mode}" type="button">${mode}</button>`).join("")}</div></div><p class="body-copy">${projects.length} project${projects.length === 1 ? "" : "s"} shown.</p><div class="project-grid">${projects.length ? projects.map(projectCard).join("") : `<div class="panel empty">No projects match this view.</div>`}</div>${phonePrompt}</section>`;
  document.getElementById("project-search").addEventListener("input", (event) => { projectQuery = event.target.value; renderProjects(); document.getElementById("project-search")?.focus(); });
  document.querySelectorAll("[data-filter]").forEach((button) => button.addEventListener("click", () => { projectFilter = button.dataset.filter; renderProjects(); }));
  document.getElementById("create-project").addEventListener("click", () => setPage("chat"));
  document.getElementById("browse-desktop").addEventListener("click", openPairModal);
  document.getElementById("projects-pair-phone")?.addEventListener("click", openPairModal);
  bindProjectActions();
}
function renderChat() {
  nodes.content.innerHTML = `<section class="chat-page"><div class="chat-scroll" id="chat-scroll">${chatMessages.length ? `<div class="messages">${chatMessages.map(messageRow).join("")}</div>` : chatEmptyState()}</div><div class="composer-shell"><div class="composer"><textarea id="chat-input" placeholder="Ask Vibyra to build, fix, or explain..."></textarea><input id="chat-attach" type="file" multiple hidden /><div class="composer-bottom"><div class="composer-tools"><button class="tool-pill" id="attach-chat" type="button">${icon("paperclip")}${chatAttachments.length ? `${chatAttachments.length} attached` : "Attach"}</button><button class="tool-pill" id="cycle-effort" type="button">${icon("bolt")}${escapeHtml(chatEfforts[chatEffortIndex])}</button><button class="tool-pill" id="cycle-model" type="button">${icon("sparkles")}${escapeHtml(chatModels[chatModelIndex])}</button></div><button class="send-button" id="send-chat" type="button" aria-label="Send message">${icon("send")}</button></div></div></div></section>`;
  document.querySelectorAll("[data-suggestion]").forEach((button) => button.addEventListener("click", () => { document.getElementById("chat-input").value = button.dataset.suggestion; document.getElementById("chat-input").focus(); }));
  document.getElementById("send-chat").addEventListener("click", sendChat);
  document.getElementById("chat-input").addEventListener("keydown", (event) => { if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) sendChat(); });
  bindChatTools();
  requestAnimationFrame(() => document.getElementById("chat-scroll")?.scrollTo(0, document.getElementById("chat-scroll").scrollHeight));
}
