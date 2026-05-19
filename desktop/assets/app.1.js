const emptyState = { machineName: "Vibyra Desktop", pairCode: "------", pairedDevice: null, pendingPair: null, latestPreview: null, events: [], projects: [], connectionUrls: [] };
const pages = [
  { key: "chat", label: "Chat", icon: "chat" },
  { key: "projects", label: "Projects", icon: "folder" },
  { key: "dashboard", label: "Builds", icon: "pulse" }
];
const suggestions = [
  { title: "Fix a bug", description: "Find and resolve issues", icon: "tool", prompt: "Find and fix the main bug in this project." },
  { title: "Explain code", description: "Understand the project", icon: "document", prompt: "Explain the structure of this project and the key files I should know about." },
  { title: "Refactor code", description: "Improve code quality", icon: "code", prompt: "Refactor this project and improve the code quality." },
  { title: "Write tests", description: "Add coverage", icon: "play", prompt: "Find the most useful tests to add for this project." }
];
const projectFilterModes = ["All", "Desktop", "Phone"];
const chatModelGroups = [
  { title: "", options: [{ key: "auto", label: "Auto", provider: "auto" }] },
  { title: "Claude Models", options: [{ badge: "New", key: "claude-opus-4", label: "Claude Opus 4", provider: "claude" }, { key: "claude-sonnet-4", label: "Claude Sonnet 4", provider: "claude" }, { key: "claude-3-5-haiku", label: "Claude Haiku 3.5", provider: "claude" }] },
  { title: "OpenAI models", options: [{ badge: "New", key: "gpt-5.5", label: "GPT-5.5", provider: "openai" }, { key: "gpt-5.4", label: "GPT-5.4", provider: "openai" }, { key: "gpt-5.4-mini", label: "GPT-5.4 Mini", provider: "openai" }, { key: "gpt-5-codex", label: "GPT-5 Codex", provider: "openai" }] },
  { title: "Gemini Models", options: [{ badge: "New", key: "gemini-2.5-pro", label: "Gemini 2.5 Pro", provider: "gemini" }, { key: "gemini-2.5-flash", label: "Gemini 2.5 Flash", provider: "gemini" }, { key: "gemini-2.0-flash", label: "Gemini 2.0 Flash", provider: "gemini" }] }
];
const chatModels = chatModelGroups.flatMap((group) => group.options);
const chatEfforts = [{ value: "low", label: "Low", short: "Low", hint: "Fast" }, { value: "medium", label: "Medium", short: "Med", hint: "Balanced" }, { value: "high", label: "High", short: "High", hint: "Deeper" }, { value: "xhigh", label: "Extra high", short: "X-Hi", hint: "Maximum" }];
const planTiers = [
  { key: "free", name: "Free", price: "£0", monthlyCredits: 50, annualCredits: 50, dailyCap: 5, agents: 0, projects: 1, modelAccess: "Budget models", perks: ["Budget AI models", "1 active project", "Community access"] },
  { key: "starter", name: "Starter", price: "£19/mo", annualPrice: "£190/yr", monthlyCredits: 500, annualCredits: 550, dailyCap: 100, agents: 1, projects: 1, modelAccess: "All models", perks: ["500 monthly credits", "All AI models", "1 active project, 1 agent"] },
  { key: "builder", name: "Builder", price: "£49/mo", annualPrice: "£490/yr", monthlyCredits: 1800, annualCredits: 1980, dailyCap: 360, agents: 2, projects: 3, modelAccess: "All models", badge: "Popular", perks: ["1,800 monthly credits", "All premium models", "3 projects, 2 agents"] },
  { key: "pro", name: "Pro", price: "£99/mo", annualPrice: "£990/yr", monthlyCredits: 4500, annualCredits: 4950, dailyCap: 900, agents: 4, projects: 10, modelAccess: "All models", perks: ["4,500 monthly credits", "Priority routing", "10 projects, 4 agents"] }
];
const modelTiers = { auto: "budget", "gpt-5.5": "premium", "gpt-5.4": "balanced", "gpt-5.4-mini": "budget", "gpt-5.4-nano": "budget", "gpt-5-codex": "premium", "claude-opus-4": "premium", "claude-sonnet-4": "balanced", "claude-3-5-haiku": "budget", "gemini-2.5-pro": "premium", "gemini-2.5-flash": "budget", "gemini-2.0-flash": "budget" };
const planAllowedTiers = { free: ["free", "budget"], starter: ["free", "budget", "balanced", "premium"], builder: ["free", "budget", "balanced", "premium"], pro: ["free", "budget", "balanced", "premium"] };
const chatAttachmentPrimaryActions = [
  { kind: "files", icon: "paperclip", label: "Files", hint: "Attach local files" },
  { kind: "folder", icon: "folder", label: "Folder", hint: "Attach folder names" }
];
const chatAttachmentTools = [];
const chatSlashCommands = [
  { id: "open", slash: "/open", icon: "folder", label: "Open folder", description: "Choose desktop project context" },
  { id: "new", slash: "/new", icon: "edit", label: "New chat", description: "Start fresh" },
  { id: "clear", slash: "/clear", icon: "trash", label: "Clear chat", description: "Remove messages" },
  { id: "help", slash: "/help", icon: "help", label: "Help", description: "List commands" }
];
const chatSkills = [
  { id: "plan", slash: "/plan", icon: "calendar", label: "Plan", description: "Make an implementation plan", mode: "chat", promptPrefix: "Make a concise implementation plan for this request. Do not edit files or apply changes yet. Explain the key steps, risks, and verification path." },
  { id: "debug", slash: "/debug", icon: "tool", label: "Debug", description: "Find the root cause", mode: "chat" },
  { id: "review", slash: "/review", icon: "search", label: "Review", description: "Review code for risks", mode: "chat", promptPrefix: "Review this code/change set. Prioritize bugs, regressions, security or data-loss risks, and missing tests. Put findings first with concrete file references when possible." },
  { id: "explain", slash: "/explain", icon: "document", label: "Explain", description: "Explain code or project context", mode: "chat" },
  { id: "fix", slash: "/fix", icon: "bolt", label: "Fix", description: "Apply a targeted fix", mode: "chat" },
  { id: "refactor", slash: "/refactor", icon: "code", label: "Refactor", description: "Clean up readability", mode: "chat" }
];
const storedPage = localStorage.getItem("vibyra.desktop.page");
const desktopChatsKey = "vibyra.desktop.recentChats";
const activeChatKey = "vibyra.desktop.activeChat";
let currentState = emptyState;
let activePage = pages.some((page) => page.key === storedPage) ? storedPage : "dashboard";
let projectQuery = "";
let projectFilter = "All";
let posting = false;
let recentChats = loadDesktopChats();
let activeChatId = localStorage.getItem(activeChatKey) || "";
let chatMessages = activeChatId ? messagesForChat(activeChatId) : [];
let chatAttachments = [];
let chatDraft = localStorage.getItem("vibyra.desktop.chatDraft") || "";
let chatSending = false;
let activeChatTool = "";
let activeChatSkill = "";
let selectedChatModel = chatModels.some((model) => model.key === localStorage.getItem("vibyra.desktop.chatModel")) ? localStorage.getItem("vibyra.desktop.chatModel") : "auto";
let reasoningEffort = chatEfforts.some((effort) => effort.value === localStorage.getItem("vibyra.desktop.reasoningEffort")) ? localStorage.getItem("vibyra.desktop.reasoningEffort") : "medium";
let openChatMenu = "";
let topbarChatMenuOpen = false;
let selectedProjectId = localStorage.getItem("vibyra.desktop.project") || "";
let openedPairRequestId = "";
const nodes = {
  content: document.getElementById("content"),
  mobileDock: document.getElementById("mobile-dock"),
  pairBody: document.getElementById("pair-modal-body"),
  pairModal: document.getElementById("pair-modal"),
  railNav: document.getElementById("rail-nav"),
  railRecents: document.getElementById("rail-recents"),
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
loadDesktopProjects();
refresh();
setInterval(refresh, 1000);

async function loadDesktopProjects() {
  try {
    const response = await fetch("/desktop/projects", { cache: "no-store" });
    if (!response.ok) return;
    const result = await response.json();
    if (Array.isArray(result.projects)) {
      currentState = { ...currentState, projects: result.projects };
      render();
    }
  } catch {
  }
}

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
  renderRecentChats();
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
  const html = pages.map((page) => `<button class="nav-button ${activePage === page.key ? "active" : ""}" type="button" data-page="${page.key}" data-tooltip="${escapeAttribute(page.label)}" aria-label="${escapeAttribute(page.label)}" title="${escapeAttribute(page.label)}">${icon(page.icon)}<span>${escapeHtml(page.label)}</span></button>`).join("");
  nodes.railNav.innerHTML = html;
  nodes.mobileDock.innerHTML = html;
  document.querySelectorAll("[data-page]").forEach((button) => button.addEventListener("click", () => setPage(button.dataset.page)));
}
function renderTopbar() {
  const connected = Boolean(currentState.pairedDevice);
  const selected = currentProject();
  const projectCount = filteredProjects().length;
  if (activePage !== "chat") topbarChatMenuOpen = false;
  const title = activePage === "chat" ? activeChatTitle() : pageTitle(activePage);
  const subtitle = activePage === "chat"
    ? chatDirectoryLabel(selected)
    : activePage === "projects"
      ? `${projectCount} project${projectCount === 1 ? "" : "s"}`
      : statusLabel();
  const showNewChat = activePage === "chat" && !isBlankNewChat();
  const account = currentAccount();
  const avatarUrl = accountImageUrl(account, account);
  const avatarName = account.name || "Vibyra User";
  const avatar = avatarUrl ? `<img src="${escapeAttribute(avatarUrl)}" alt="" />` : escapeHtml(accountInitials(avatarName));
  nodes.topbar.innerHTML = `<div class="top-left"><button class="connection-chip" type="button" id="open-pair" aria-label="${escapeAttribute(statusLabel())}" title="${escapeAttribute(statusLabel())}">${icon("phone")}${connected ? `<span class="dot"></span>` : ""}</button></div><div class="top-title"><h1>${escapeHtml(title)}</h1><p>${escapeHtml(subtitle)}</p></div><div class="top-actions">${showNewChat ? `<button class="icon-button new-chat-button" id="clear-chat" type="button" aria-label="New chat" title="New chat">${icon("plus")}</button>` : ""}${activePage === "chat" ? `<div class="topbar-menu-wrap"><button class="icon-button chat-actions-button" id="open-chat-actions" type="button" aria-label="Chat actions" title="Chat actions">${icon("menu")}</button>${topbarChatMenuOpen ? chatActionMenu() : ""}</div>` : ""}<button class="token-pill account-avatar-button" id="open-token" type="button" aria-label="Account and membership" title="Account and membership"><span class="topbar-avatar">${avatar}</span></button></div>`;
  document.getElementById("open-pair")?.addEventListener("click", openPairModal);
  document.getElementById("clear-chat")?.addEventListener("click", startNewChat);
  document.getElementById("open-token")?.addEventListener("click", openTokenModal);
  document.getElementById("open-chat-actions")?.addEventListener("click", () => { topbarChatMenuOpen = !topbarChatMenuOpen; renderTopbar(); });
  document.querySelectorAll("[data-chat-action]").forEach((button) => button.addEventListener("click", () => handleChatAction(button.dataset.chatAction)));
}
function renderRecentChats() {
  if (!nodes.railRecents) return;
  const rows = recentChats.filter((chat) => !chat.archived).slice(0, 5);
  nodes.railRecents.innerHTML = `<div class="rail-section-head"><span>Recent chats</span>${isBlankNewChat() ? "" : `<button id="rail-new-chat" type="button" aria-label="New chat" title="New chat">${icon("plus")}</button>`}</div><div class="rail-chat-list">${rows.length ? rows.map((chat) => `<button class="rail-chat ${activeChatId === chat.id ? "active" : ""}" type="button" data-chat-id="${escapeAttribute(chat.id)}" title="${escapeAttribute(chat.title)}">${icon(chat.pinned ? "pin" : "chat")}<span>${escapeHtml(chat.title)}</span></button>`).join("") : `<p class="rail-empty">No recent chats yet</p>`}</div>`;
  document.getElementById("rail-new-chat")?.addEventListener("click", startNewChat);
  document.querySelectorAll("[data-chat-id]").forEach((button) => button.addEventListener("click", () => openRecentChat(button.dataset.chatId)));
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
  const previousInput = document.getElementById("chat-input");
  const restoreFocus = document.activeElement === previousInput;
  const cursor = restoreFocus ? previousInput.selectionStart : chatDraft.length;
  const runCard = activeRunCard();
  nodes.content.innerHTML = `<section class="chat-page"><div class="chat-scroll" id="chat-scroll">${chatMessages.length || runCard ? `<div class="messages">${chatMessages.map(messageRow).join("")}${runCard}</div>` : chatEmptyState()}</div><div class="composer-shell"><div class="composer"><div class="composer-context">${projectContextChip()}${attachmentChips()}${toolChip()}${skillChip()}</div><textarea id="chat-input" placeholder="Message Vibyra..." rows="1">${escapeHtml(chatDraft)}</textarea>${slashMenu()}<input id="chat-attach" type="file" accept="*/*" multiple hidden /><div class="composer-bottom"><div class="composer-tools"><div class="tool-menu-wrap"><button class="icon-tool" id="open-attach-menu" type="button" aria-label="Attach context" title="Attach context">${icon("paperclip")}</button>${openChatMenu === "attach" ? attachMenu() : ""}</div><div class="tool-menu-wrap"><button class="tool-pill quiet" id="open-model-menu" type="button">${icon("sparkles")}<span>${escapeHtml(currentChatModel().label)}</span>${icon("chevron-down")}</button>${openChatMenu === "model" ? modelMenu() : ""}</div><div class="tool-menu-wrap"><button class="tool-pill quiet" id="open-effort-menu" type="button">${icon("bolt")}<span>${escapeHtml(currentEffort().short)}</span>${icon("chevron-down")}</button>${openChatMenu === "effort" ? effortMenu() : ""}</div></div><button class="send-button" id="send-chat" type="button" aria-label="Send message" ${chatDraft.trim() && !chatSending ? "" : "disabled"}>${icon("send")}</button></div></div></div></section>`;
  document.querySelectorAll("[data-suggestion]").forEach((button) => button.addEventListener("click", () => { const input = document.getElementById("chat-input"); input.value = button.dataset.suggestion; chatDraft = input.value; localStorage.setItem("vibyra.desktop.chatDraft", chatDraft); input.focus(); renderSendState(); }));
  document.getElementById("clear-project")?.addEventListener("click", () => { selectedProjectId = ""; localStorage.removeItem("vibyra.desktop.project"); render(); });
  document.getElementById("clear-attachments")?.addEventListener("click", () => { chatAttachments = []; renderChat(); });
  document.getElementById("clear-tool")?.addEventListener("click", () => { activeChatTool = ""; renderChat(); });
  document.getElementById("clear-skill")?.addEventListener("click", () => { activeChatSkill = ""; renderChat(); });
  document.getElementById("open-attach-menu")?.addEventListener("click", () => toggleChatMenu("attach"));
  document.getElementById("open-model-menu")?.addEventListener("click", () => toggleChatMenu("model"));
  document.getElementById("open-effort-menu")?.addEventListener("click", () => toggleChatMenu("effort"));
  document.querySelectorAll("[data-model]").forEach((button) => button.addEventListener("click", () => selectChatModel(button.dataset.model)));
  document.querySelectorAll("[data-effort]").forEach((button) => button.addEventListener("click", () => { reasoningEffort = button.dataset.effort; localStorage.setItem("vibyra.desktop.reasoningEffort", reasoningEffort); openChatMenu = ""; renderChat(); }));
  document.querySelectorAll("[data-attach-kind]").forEach((button) => button.addEventListener("click", () => openAttachmentPicker(button.dataset.attachKind)));
  document.querySelectorAll("[data-chat-tool]").forEach((button) => button.addEventListener("click", () => selectChatTool(button.dataset.chatTool)));
  document.querySelectorAll("[data-chat-skill]").forEach((button) => button.addEventListener("click", () => selectChatSkill(button.dataset.chatSkill)));
  document.querySelectorAll("[data-slash-command]").forEach((button) => button.addEventListener("click", () => applySlashCommand(button.dataset.slashCommand)));
  document.querySelectorAll("[data-slash-skill]").forEach((button) => button.addEventListener("click", () => selectChatSkill(button.dataset.slashSkill, true)));
  document.getElementById("send-chat").addEventListener("click", sendChat);
  document.getElementById("chat-input").addEventListener("input", (event) => { const wasSlashMenuOpen = Boolean(chatDraft.match(/^\/(\w*)$/)); chatDraft = event.target.value; localStorage.setItem("vibyra.desktop.chatDraft", chatDraft); const isSlashMenuOpen = Boolean(chatDraft.match(/^\/(\w*)$/)); isSlashMenuOpen || wasSlashMenuOpen ? renderChat() : renderSendState(); });
  document.getElementById("chat-input").addEventListener("keydown", (event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); sendChat(); } });
  bindChatTools();
  bindGeneratedAppCards();
  requestAnimationFrame(() => {
    const input = document.getElementById("chat-input");
    renderSendState();
    if (restoreFocus && input) { input.focus(); input.setSelectionRange(cursor, cursor); }
    document.getElementById("chat-scroll")?.scrollTo(0, document.getElementById("chat-scroll").scrollHeight);
  });
}
