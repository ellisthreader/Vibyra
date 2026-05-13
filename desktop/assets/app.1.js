const emptyState = { machineName: "Vibyra Desktop", pairCode: "------", pairedDevice: null, pendingPair: null, latestPreview: null, events: [], projects: [], connectionUrls: [] };
const pages = [
  { key: "dashboard", label: "Home", icon: "home" },
  { key: "projects", label: "Projects", icon: "folder" },
  { key: "chat", label: "AI Chat", icon: "chat" },
  { key: "community", label: "Community", icon: "people" },
  { key: "billing", label: "Plan & Billing", icon: "card" },
  { key: "profile", label: "Profile", icon: "user" }
];
const suggestions = [
  { title: "Fix a bug", description: "Find and resolve issues", icon: "tool", prompt: "Find and fix the main bug in this project." },
  { title: "Build a feature", description: "Add something new", icon: "cube", prompt: "Build a new feature for this project." },
  { title: "Refactor code", description: "Improve code quality", icon: "code", prompt: "Refactor this project and improve the code quality." },
  { title: "Ship it", description: "Prepare and deploy", icon: "rocket", prompt: "Prepare this project to ship." }
];
const communityPosts = [];
const projectFilterModes = ["All", "Desktop", "Phone"];
const chatModels = ["GPT-5.5", "Claude", "Gemini"];
const chatEfforts = ["Low", "Med", "High"];
let currentState = emptyState;
let activePage = localStorage.getItem("vibyra.desktop.page") || "dashboard";
let projectQuery = "";
let projectFilter = "All";
let communityFilter = "All";
let communityQuery = "";
let profileRow = "Billing & subscription";
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
  renderNav();
  renderTopbar();
  nodes.content.className = activePage === "chat" ? "content chat-content" : "content";
  if (activePage === "dashboard") renderDashboard();
  if (activePage === "projects") renderProjects();
  if (activePage === "chat") renderChat();
  if (activePage === "community") renderCommunity();
  if (activePage === "billing") renderProfile();
  if (activePage === "profile") renderProfile();
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
  const accountMeta = user ? "desktop" : "phone app";
  if (activePage === "dashboard") {
    nodes.topbar.innerHTML = `<button class="connection-button" type="button" id="open-pair"><span><span class="kicker"><span class="dot ${statusTone() === "success" ? "" : statusTone()}"></span> ${escapeHtml(statusLabel())}</span><span class="machine-title">${escapeHtml(currentState.machineName || "Vibyra Desktop")} ${icon("chevron-down")}</span></span></button><div class="top-actions"><button class="token-pill" id="open-token" type="button">${icon("user")}<span><strong>${escapeHtml(accountLabel)}</strong><span>${escapeHtml(accountMeta)}</span></span>${icon("chevron-down")}</button></div>`;
  } else {
    nodes.topbar.innerHTML = `<div class="page-title">${escapeHtml(pageTitle(activePage))}</div><div class="top-actions">${activePage === "chat" ? `<button class="icon-button" id="clear-chat" type="button" aria-label="New chat">${icon("plus")}</button>` : ""}<button class="token-pill" id="open-token" type="button">${icon("user")}<span><strong>${escapeHtml(accountLabel)}</strong><span>${escapeHtml(accountMeta)}</span></span></button></div>`;
  }
  document.getElementById("open-pair")?.addEventListener("click", openPairModal);
  document.getElementById("open-token")?.addEventListener("click", openTokenModal);
  document.getElementById("clear-chat")?.addEventListener("click", () => { chatMessages = []; renderChat(); });
}
function renderRailStatus() {
  const paired = Boolean(currentState.pairedDevice);
  const pending = currentState.pendingPair && currentState.pendingPair.status === "pending";
  nodes.railStatus.innerHTML = paired ? `<div class="rail-status-line"><span class="dot"></span><span>${escapeHtml(statusShortLabel())}</span></div><button class="rail-machine" type="button" id="rail-pair">${escapeHtml(currentState.machineName || "Vibyra Desktop")} ${icon("chevron-down")}</button><button class="feedback-button" type="button">${icon("chat")}Give feedback</button>` : `<button class="rail-status-card ${pending ? "pending" : ""}" type="button" id="rail-pair"><span class="rail-status-top"><span class="dot ${pending ? "warning" : "offline"}"></span><span>${pending ? "Approval needed" : "Phone offline"}</span></span><span class="rail-status-main"><span class="rail-phone-icon">${icon(pending ? "clock" : "link")}</span><span><strong>${pending ? "Review pairing" : "Pair your phone"}</strong><small>${pending ? "A phone is waiting for access." : "Connect to browse and build."}</small></span></span><span class="rail-status-action">${pending ? "Review" : "Connect"} ${icon("arrow")}</span></button><button class="feedback-button" type="button">${icon("chat")}Give feedback</button>`;
  document.getElementById("rail-pair")?.addEventListener("click", openPairModal);
}
function renderDashboard() {
  const user = typeof desktopAuthUser === "function" ? desktopAuthUser() : null;
  const firstName = (user?.name || "Google User").split(" ")[0];
  const machine = currentState.machineName || "Vibyra Desktop";
  nodes.content.innerHTML = `<div class="home-page"><section class="home-main"><div class="home-hero"><div class="home-copy"><h1>Good to see you, ${escapeHtml(firstName)} <span aria-hidden="true">👋</span></h1><p>Let's build something amazing today.</p><div class="hero-actions"><button class="primary-button hero-button" type="button" data-jump="chat">${icon("plus")}Create new build</button><button class="secondary-button hero-button" type="button" data-jump="projects">${icon("folder")}View projects</button></div></div></div><div class="home-stats">${statCard("desktop", machine, "Local desktop bridge", statusShortLabel(), "success")}${statCard("cube", 7, "Projects")}${statCard("calendar", 18, "Events")}${statCard("pulse", "OK", "System health", null, "health")}</div><section class="live-builds"><div class="builds-head"><h2>Live builds</h2><button class="text-link" type="button" data-jump="projects">View all builds ${icon("arrow")}</button></div><div class="build-tabs"><button class="active" type="button">All</button><button type="button">Building</button><button type="button">Queued</button><button type="button">Completed</button><button type="button">Failed</button></div><div class="build-list">${buildRows()}</div></section></section><aside class="home-aside"><section class="activity-panel"><div class="activity-head"><h2>Activity</h2><button class="text-link" type="button">View all ${icon("arrow")}</button></div><div class="activity-list">${homeActivityRows()}</div></section></aside></div>`;
  bindJumps();
}
function renderProjects() {
  const projects = filteredProjects();
  const phonePrompt = currentState.pairedDevice ? "" : `<div class="projects-phone-prompt"><div class="projects-phone-panel"><span class="projects-phone-icon">${icon("folder")}</span><h2>Can't find your project?</h2><p>Pair your phone to browse another device or approve access.</p><button class="projects-phone-link" type="button" id="projects-pair-phone">Pair a phone ${icon("arrow")}</button></div></div>`;
  nodes.content.innerHTML = `<section class="projects-page"><div class="toolbar"><button class="primary-button" type="button" id="create-project">${icon("plus")}Create Project</button><button class="secondary-button" type="button" id="browse-desktop">${icon("search")}Pair phone</button><label class="search">${icon("search")}<input id="project-search" placeholder="Search projects..." value="${escapeAttribute(projectQuery)}" /></label><div class="filter-row">${projectFilterModes.map((mode) => `<button class="chip ${projectFilter === mode ? "active" : ""}" data-filter="${mode}" type="button">${mode}</button>`).join("")}</div></div><p class="body-copy">Showing ${projectFilter === "All" ? "all" : projectFilter.toLowerCase()} projects</p><div class="project-grid">${projects.length ? projects.map(projectCard).join("") : `<div class="panel empty">No projects match this view.</div>`}</div>${phonePrompt}</section>`;
  document.getElementById("project-search").addEventListener("input", (event) => { projectQuery = event.target.value; renderProjects(); document.getElementById("project-search")?.focus(); });
  document.querySelectorAll("[data-filter]").forEach((button) => button.addEventListener("click", () => { projectFilter = button.dataset.filter; renderProjects(); }));
  document.getElementById("create-project").addEventListener("click", handleCreateProject);
  document.getElementById("browse-desktop").addEventListener("click", openPairModal);
  document.getElementById("projects-pair-phone")?.addEventListener("click", openPairModal);
  bindProjectActions();
}
function renderChat() {
  nodes.content.innerHTML = `<section class="chat-page"><div class="chat-scroll" id="chat-scroll">${chatMessages.length ? `<div class="messages">${chatMessages.map(messageRow).join("")}</div>` : chatEmptyState()}</div><div class="composer-shell"><div class="composer"><textarea id="chat-input" placeholder="Ask anything about your project..."></textarea><input id="chat-attach" type="file" multiple hidden /><div class="composer-bottom"><div class="composer-tools"><button class="tool-pill" id="attach-chat" type="button">${icon("paperclip")}${chatAttachments.length ? `${chatAttachments.length} attached` : "Attach"}</button><button class="tool-pill" id="cycle-effort" type="button">${icon("bolt")}${escapeHtml(chatEfforts[chatEffortIndex])}</button><button class="tool-pill" id="cycle-model" type="button">${icon("sparkles")}${escapeHtml(chatModels[chatModelIndex])}</button></div><button class="send-button" id="send-chat" type="button" aria-label="Send message">${icon("send")}</button></div></div></div></section>`;
  document.querySelectorAll("[data-suggestion]").forEach((button) => button.addEventListener("click", () => { document.getElementById("chat-input").value = button.dataset.suggestion; document.getElementById("chat-input").focus(); }));
  document.getElementById("send-chat").addEventListener("click", sendChat);
  document.getElementById("chat-input").addEventListener("keydown", (event) => { if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) sendChat(); });
  bindChatTools();
  requestAnimationFrame(() => document.getElementById("chat-scroll")?.scrollTo(0, document.getElementById("chat-scroll").scrollHeight));
}
function renderCommunity() {
  const posts = communityPosts.filter((post) => {
    const query = communityQuery.trim().toLowerCase();
    const filterOk = communityFilter === "All" || post.tag === communityFilter;
    const queryOk = !query || [post.title, post.user, post.description, ...post.tags].join(" ").toLowerCase().includes(query);
    return filterOk && queryOk;
  });
  nodes.content.innerHTML = `<div class="community-tools"><div class="tabs">${["All", "Recent", "Popular", "Featured"].map((filter) => `<button class="chip ${communityFilter === filter ? "active" : ""}" data-community-filter="${filter}" type="button">${filter}</button>`).join("")}</div><label class="search">${icon("search")}<input id="community-search" placeholder="Search projects, builders, tags..." value="${escapeAttribute(communityQuery)}" /></label></div><div class="community-grid">${posts.length ? posts.map(communityCard).join("") : `<div class="panel empty">No apps found. Try a different search or filter.</div>`}</div>`;
  document.querySelectorAll("[data-community-filter]").forEach((button) => button.addEventListener("click", () => { communityFilter = button.dataset.communityFilter; renderCommunity(); }));
  document.getElementById("community-search").addEventListener("input", (event) => { communityQuery = event.target.value; renderCommunity(); document.getElementById("community-search")?.focus(); });
  bindCommunityActions();
}
function renderProfile() {
  const user = typeof desktopAuthUser === "function" ? desktopAuthUser() : null;
  const name = user?.name || "Signed in to Vibyra";
  const email = user?.email || "Desktop account session";
  nodes.content.innerHTML = `<div class="profile-layout"><div class="stack"><section class="panel stack"><div class="profile-top"><div class="avatar-large">${escapeHtml((name[0] || "V").toUpperCase())}</div><div><div class="profile-name">${escapeHtml(name)}</div><div class="profile-email">${escapeHtml(email)}</div><div class="profile-plan">${icon("diamond")}Desktop session</div></div></div><div class="usage-strip"><div class="usage-item"><div class="profile-icon">${icon("folder")}</div><div><div class="profile-name">${(currentState.projects || []).length}</div><div class="body-copy">local projects</div></div></div><div class="usage-item"><div class="profile-icon">${icon("desktop")}</div><div><div class="profile-name">${currentState.pairedDevice ? "Connected" : "Waiting"}</div><div class="body-copy">Phone pairing</div></div></div></div></section>${settingsGroup("ACCOUNT", ["Profile information", "Billing & subscription", "Usage & history", "Refer & earn"])}${settingsGroup("PREFERENCES", ["Notifications", "Appearance", "Privacy & security", "Language"])}${settingsGroup("SUPPORT", ["Help center", "Contact support", "Terms of service", "Log out"])}</div><section class="panel"><div class="section-title"><div><p>Account</p><h2>${escapeHtml(profileRow)}</h2></div><span class="tag">Desktop</span></div><div class="empty">Billing and token balance still sync from the mobile account. This desktop session gates access to the local shell.</div></section></div>`;
  document.querySelectorAll("[data-setting]").forEach((button) => button.addEventListener("click", () => { profileRow = button.dataset.setting; renderProfile(); }));
}
