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
  topbar: document.getElementById("topbar"),
  chromePage: document.getElementById("desktop-chrome-page"),
  chromeActions: document.getElementById("desktop-chrome-actions"),
  chromeStatus: document.getElementById("desktop-chrome-status")
};
function bootstrapDesktop() {
  document.getElementById("close-pair").innerHTML = icon("close");
  document.getElementById("close-token").innerHTML = icon("close");
  document.getElementById("rail-collapse").innerHTML = icon("chevron");
  document.getElementById("rail-expand").innerHTML = icon("chevron");
  document.querySelector("[data-window-action='minimize']")?.replaceChildren(svgFromHtml(icon("minus")));
  document.querySelector("[data-window-action='maximize']")?.replaceChildren(svgFromHtml(icon("square")));
  document.querySelector("[data-window-action='close']")?.replaceChildren(svgFromHtml(icon("close")));
  document.getElementById("close-pair").addEventListener("click", closePairModal);
  document.getElementById("close-token").addEventListener("click", closeTokenModal);
  nodes.pairModal.addEventListener("click", (event) => { if (event.target === nodes.pairModal) closePairModal(); });
  nodes.tokenModal.addEventListener("click", (event) => { if (event.target === nodes.tokenModal) closeTokenModal(); });
  document.addEventListener("click", (event) => {
    if (!topbarAccountMenuOpen && !topbarChatMenuOpen) return;
    if (event.target.closest(".topbar-menu-wrap")) return;
    topbarAccountMenuOpen = false;
    topbarChatMenuOpen = false;
    renderTopbar();
  });
  document.getElementById("rail-collapse")?.addEventListener("click", () => setRailCollapsed(!railCollapsed));
  document.getElementById("rail-expand")?.addEventListener("click", () => setRailCollapsed(false));
  document.querySelectorAll("[data-window-action]").forEach((button) => button.addEventListener("click", () => handleWindowAction(button.dataset.windowAction)));
  if (window.vibyraDesktopWindow?.isElectron) document.body.classList.add("electron-shell");
  applyRailState();
  renderNav();
  loadDesktopProjects();
}

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
  applyRailState();
  renderNav();
  renderRecentChats();
  renderTopbar();
  nodes.content.className = activePage === "chat" ? "content chat-content" : activePage === "terminals" ? "content terminal-content" : activePage === "profile" ? "content profile-content" : "content";
  if (activePage === "chat") renderChat();
  if (activePage === "terminals") {
    if (typeof renderTerminalsPage === "function") renderTerminalsPage();
    else nodes.content.innerHTML = `<section class="terminal-page"><div class="terminal-empty">Loading terminals...</div></section>`;
  }
  if (activePage === "projects") renderProjects();
  if (activePage === "dashboard") renderDashboard();
  if (activePage === "profile" && typeof renderProfile === "function") renderProfile();
  renderRailStatus();
  if (nodes.pairModal.classList.contains("open")) renderPairModal();
  if (nodes.tokenModal.classList.contains("open")) renderTokenModal();
}
function setRailCollapsed(value) {
  railCollapsed = Boolean(value);
  localStorage.setItem(railCollapsedKey, railCollapsed ? "true" : "false");
  applyRailState();
}
function svgFromHtml(markup) {
  const template = document.createElement("template");
  template.innerHTML = markup.trim();
  return template.content.firstElementChild;
}
function handleWindowAction(action) {
  const controls = window.vibyraDesktopWindow;
  if (!controls?.isElectron) return;
  if (action === "minimize") controls.minimize?.();
  if (action === "maximize") controls.maximize?.();
  if (action === "close") controls.close?.();
}
function isElectronShell() {
  return Boolean(window.vibyraDesktopWindow?.isElectron);
}
function applyRailState() {
  document.querySelector(".app")?.classList.toggle("rail-collapsed", railCollapsed);
  const label = railCollapsed ? "Expand sidebar" : "Collapse sidebar";
  const button = document.getElementById("rail-collapse");
  if (button) {
    button.setAttribute("aria-label", label);
    button.setAttribute("title", label);
  }
}
function renderNav() {
  const html = pages.filter((page) => !page.hidden).map((page) => `<button class="nav-button ${activePage === page.key ? "active" : ""}" type="button" data-page="${page.key}" data-tooltip="${escapeAttribute(page.label)}" aria-label="${escapeAttribute(page.label)}" title="${escapeAttribute(page.label)}">${icon(page.icon)}<span>${escapeHtml(page.label)}</span></button>`).join("");
  nodes.railNav.innerHTML = html;
  nodes.mobileDock.innerHTML = html;
  document.querySelectorAll("[data-page]").forEach((button) => button.addEventListener("click", () => setPage(button.dataset.page)));
}
function renderTopbar() {
  if (!document.body.classList.contains("desktop-authenticated")) {
    if (nodes.chromePage) nodes.chromePage.innerHTML = "";
    if (nodes.chromeActions) nodes.chromeActions.innerHTML = "";
    if (nodes.chromeStatus) nodes.chromeStatus.textContent = "";
    if (nodes.topbar) nodes.topbar.innerHTML = "";
    return;
  }
  const connected = Boolean(currentState.pairedDevice);
  const selected = currentProject();
  const projectCount = filteredProjects().length;
  if (activePage !== "chat") topbarChatMenuOpen = false;
  const terminalPage = activePage === "terminals";
  const title = activePage === "chat" ? activeChatTitle() : terminalPage ? "" : activePage === "dashboard" ? "Vibyra Desktop" : pageTitle(activePage);
  const subtitle = activePage === "chat"
    ? chatDirectoryLabel(selected)
    : activePage === "projects"
      ? `${projectCount} project${projectCount === 1 ? "" : "s"}`
      : terminalPage ? "" : activePage === "dashboard" ? desktopChromeStatusText() : statusLabel();
  const showNewChat = activePage === "chat" && !isBlankNewChat();
  const account = currentAccount();
  const avatarUrl = accountImageUrl(account, account);
  const avatarName = account.name || "Vibyra User";
  const avatar = avatarUrl ? `<img src="${escapeAttribute(avatarUrl)}" alt="" />` : escapeHtml(accountInitials(avatarName));
  const terminalTopbar = terminalPage && typeof terminalTopbarHtml === "function" ? terminalTopbarHtml() : "";
  const left = `<div class="top-left"><button class="connection-chip" type="button" id="open-pair" aria-label="${escapeAttribute(statusLabel())}" title="${escapeAttribute(statusLabel())}">${icon("phone")}${connected ? `<span class="dot"></span>` : ""}</button></div>`;
  const center = `<div class="top-title ${terminalPage ? "terminal-top-title" : ""}">${terminalPage ? terminalTopbar : `<h1>${escapeHtml(title)}</h1><p>${escapeHtml(subtitle)}</p>`}</div>`;
  const actions = `${showNewChat ? `<button class="icon-button new-chat-button" id="clear-chat" type="button" aria-label="New chat" title="New chat">${icon("plus")}</button>` : ""}${activePage === "chat" ? `<div class="topbar-menu-wrap"><button class="icon-button chat-actions-button" id="open-chat-actions" type="button" aria-label="Chat actions" title="Chat actions">${icon("menu")}</button>${topbarChatMenuOpen ? chatActionMenu() : ""}</div>` : ""}<div class="topbar-menu-wrap topbar-menu-wrap--account"><button class="token-pill account-avatar-button" id="open-account-menu" type="button" aria-haspopup="menu" aria-expanded="${topbarAccountMenuOpen ? "true" : "false"}" aria-label="Account menu" title="Account menu"><span class="topbar-avatar">${avatar}</span></button>${topbarAccountMenuOpen ? accountMenu() : ""}</div>`;
  if (isElectronShell()) {
    nodes.topbar.innerHTML = "";
    if (nodes.chromePage) nodes.chromePage.innerHTML = center;
    if (nodes.chromeActions) nodes.chromeActions.innerHTML = `${left}<div class="top-actions">${actions}</div>`;
    if (nodes.chromeStatus) nodes.chromeStatus.textContent = statusLabel();
  } else {
    if (nodes.chromePage) nodes.chromePage.innerHTML = "";
    if (nodes.chromeActions) nodes.chromeActions.innerHTML = "";
    nodes.topbar.innerHTML = `${left}${center}<div class="top-actions">${actions}</div>`;
  }
  document.getElementById("open-pair")?.addEventListener("click", openPairModal);
  document.getElementById("clear-chat")?.addEventListener("click", startNewChat);
  document.getElementById("open-account-menu")?.addEventListener("click", (event) => { event.stopPropagation(); topbarAccountMenuOpen = !topbarAccountMenuOpen; topbarChatMenuOpen = false; renderTopbar(); });
  document.querySelectorAll("[data-account-action]").forEach((button) => button.addEventListener("click", (event) => { event.stopPropagation(); handleAccountAction(button.dataset.accountAction); }));
  document.getElementById("open-chat-actions")?.addEventListener("click", (event) => { event.stopPropagation(); topbarChatMenuOpen = !topbarChatMenuOpen; topbarAccountMenuOpen = false; renderTopbar(); });
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
  nodes.railStatus.innerHTML = `<button class="rail-status-card ${pending ? "pending" : ""}" type="button" id="rail-pair" aria-label="${escapeAttribute(pending ? "Review pairing" : paired ? "Phone connected" : "Pair phone")}" title="${escapeAttribute(pending ? "Review pairing" : paired ? "Phone connected" : "Pair phone")}"><span class="rail-status-top"><span class="dot ${pending ? "warning" : paired ? "" : "offline"}"></span><span>${pending ? "Approval needed" : statusLabel()}</span></span><span class="rail-status-main"><span class="rail-phone-icon">${icon(pending ? "clock" : paired ? "phone" : "link")}</span><span><strong>${pending ? "Review pairing" : paired ? "Phone connected" : "Pair phone"}</strong><small>${pending ? "A phone is waiting for access." : paired ? currentState.pairedDevice : "Connect your phone to start builds."}</small></span></span></button>`;
  document.getElementById("rail-pair")?.addEventListener("click", openPairModal);
}
