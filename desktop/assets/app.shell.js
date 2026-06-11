const nodes = {
  content: document.getElementById("content"),
  mobileDock: document.getElementById("mobile-dock"),
  pairBody: document.getElementById("pair-modal-body"),
  pairModal: document.getElementById("pair-modal"),
  profileBody: document.getElementById("profile-modal-body"),
  profileModal: document.getElementById("profile-modal"),
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
let desktopRefreshTimer = null;
let lastDesktopStateSignature = "";
let lastDesktopRefreshError = "";

function bootstrapDesktop() {
  document.getElementById("close-pair").innerHTML = icon("close");
  document.getElementById("close-profile").innerHTML = icon("close");
  document.getElementById("close-token").innerHTML = icon("close");
  document.getElementById("rail-collapse").innerHTML = icon("chevron");
  document.getElementById("rail-expand").innerHTML = icon("chevron");
  document.querySelector("[data-window-action='minimize']")?.replaceChildren(svgFromHtml(icon("minus")));
  document.querySelector("[data-window-action='maximize']")?.replaceChildren(svgFromHtml(icon("square")));
  document.querySelector("[data-window-action='close']")?.replaceChildren(svgFromHtml(icon("close")));
  document.getElementById("close-pair").addEventListener("click", closePairModal);
  document.getElementById("close-profile").addEventListener("click", closeProfileModal);
  document.getElementById("close-token").addEventListener("click", closeTokenModal);
  nodes.pairModal.addEventListener("click", (event) => { if (event.target === nodes.pairModal) closePairModal(); });
  nodes.profileModal.addEventListener("click", (event) => { if (event.target === nodes.profileModal) closeProfileModal(); });
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
  if (window.vibyraDesktopWindow?.isElectron) {
    document.body.classList.add("electron-shell");
    const chrome = document.querySelector(".desktop-chrome");
    const railLogo = document.querySelector(".rail-logo");
    if (chrome && railLogo) chrome.prepend(railLogo);
  }
  applyRailState();
  renderNav();
  loadDesktopProjects();
}

function startDesktopRefresh() {
  if (desktopRefreshTimer) return;
  refresh();
  desktopRefreshTimer = setInterval(refresh, 1000);
}

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
    const nextState = { ...emptyState, ...(await response.json()) };
    const accountSessionExpired = Boolean(currentState.desktopAccount && !nextState.desktopAccount && desktopAuthSession()?.token);
    const nextSignature = JSON.stringify(nextState);
    const stateChanged = nextSignature !== lastDesktopStateSignature;
    currentState = nextState;
    lastDesktopStateSignature = nextSignature;
    lastDesktopRefreshError = "";
    openPendingPairRequest();
    if (accountSessionExpired) {
      desktopSignOut();
      showAuthError("Your Vibyra session expired. Log in again to continue.");
    }
    if (stateChanged) render();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not load desktop state";
    if (message === lastDesktopRefreshError) return;
    lastDesktopRefreshError = message;
    currentState = { ...currentState, events: [{ source: "Desktop", message, tone: "error" }] };
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
  if (typeof captureTerminalModelScrolls === "function") captureTerminalModelScrolls(document);
  const terminalModelSearch = typeof focusedTerminalModelSearch === "function" ? focusedTerminalModelSearch() : null;
  if (!pages.some((page) => page.key === activePage)) activePage = "chat";
  document.body.classList.toggle("desktop-home-active", activePage === "dashboard");
  applyRailState();
  renderNav();
  renderRecentChats();
  const terminalNewPickerOpen = activePage === "terminals" && newTerminalMenuOpen && document.querySelector('[data-terminal-model-picker="new"]');
  if (!(activePage === "terminals" && (terminalModelSearch?.target === "new" || terminalNewPickerOpen))) renderTopbar();
  nodes.content.className = activePage === "chat"
    ? "content chat-content"
    : activePage === "terminals"
      ? "content terminal-content"
      : activePage === "dashboard"
        ? "content home-content"
        : "content";
  if (activePage === "chat") renderChat();
  if (activePage === "terminals") {
    if (typeof renderTerminalsPage === "function") renderTerminalsPage();
    else nodes.content.innerHTML = `<section class="terminal-page"><div class="terminal-empty">Loading terminals...</div></section>`;
  }
  if (activePage === "projects") renderProjects();
  if (activePage === "dashboard") renderDashboard();
  renderRailStatus();
  if (nodes.pairModal.classList.contains("open")) renderPairModal();
  if (nodes.tokenModal.classList.contains("open") && !(tokenModalView === "plans" && nodes.tokenBody?.querySelector(".token-plan-picker"))) renderTokenModal();
}
function setRailCollapsed(value, options = {}) {
  const companionOwnsRail = document.querySelector(".app")?.classList.contains("terminal-companion-active");
  if (!value && companionOwnsRail && !options.force) return;
  railCollapsed = Boolean(value);
  if (options.persist !== false) localStorage.setItem(railCollapsedKey, railCollapsed ? "true" : "false");
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
  const visiblePages = pages.filter((page) => !page.hidden);
  const pageButton = (page) => `<button class="nav-button ${activePage === page.key ? "active" : ""}" type="button" data-page="${page.key}" data-tooltip="${escapeAttribute(page.label)}" aria-label="${escapeAttribute(page.label)}" title="${escapeAttribute(page.label)}">${icon(page.icon)}<span>${escapeHtml(page.label)}</span></button>`;
  nodes.railNav.innerHTML = visiblePages.map((page) => {
    if (page.key !== "terminals") return pageButton(page);
    const projects = typeof terminalRailProjectsHtml === "function" ? terminalRailProjectsHtml() : "";
    const create = typeof terminalRailCreateButtonHtml === "function" ? terminalRailCreateButtonHtml() : "";
    return `<div class="rail-nav-group rail-nav-group--terminals"><div class="terminal-rail-heading">${pageButton(page)}${create}</div>${projects}</div>`;
  }).join("");
  nodes.mobileDock.innerHTML = visiblePages.map(pageButton).join("");
  document.querySelectorAll("[data-page]").forEach((button) => button.addEventListener("click", () => setPage(button.dataset.page)));
  if (typeof bindTerminalProjectGroupControls === "function") bindTerminalProjectGroupControls(nodes.railNav);
}
function renderTopbar() {
  if (!document.body.classList.contains("desktop-authenticated")) {
    if (nodes.chromePage) nodes.chromePage.innerHTML = "";
    if (nodes.chromeActions) nodes.chromeActions.innerHTML = "";
    if (nodes.chromeStatus) nodes.chromeStatus.textContent = "";
    if (nodes.topbar) nodes.topbar.innerHTML = "";
    return;
  }
  const selected = currentProject();
  const projectCount = filteredProjects().length;
  if (activePage !== "chat") topbarChatMenuOpen = false;
  const terminalPage = activePage === "terminals";
  const title = activePage === "chat" ? activeChatTitle() : terminalPage ? "" : pageTitle(activePage);
  const subtitle = activePage === "chat"
    ? selected ? chatDirectoryLabel(selected) : ""
    : activePage === "projects"
      ? `${projectCount} project${projectCount === 1 ? "" : "s"}`
      : terminalPage ? "" : activePage === "dashboard" ? desktopChromeStatusText() : statusLabel();
  const showNewChat = activePage === "chat" && !isBlankNewChat();
  const account = currentAccount();
  const avatarUrl = accountImageUrl(account, account);
  const avatarName = account.name || "Vibyra User";
  const avatar = avatarUrl ? `<img src="${escapeAttribute(avatarUrl)}" alt="" />` : escapeHtml(accountInitials(avatarName));
  const terminalTopbar = terminalPage && typeof terminalTopbarHtml === "function" ? terminalTopbarHtml() : "";
  const center = `<div class="top-title ${terminalPage ? "terminal-top-title" : ""}">${terminalPage ? terminalTopbar : `<h1>${escapeHtml(title)}</h1><p>${escapeHtml(subtitle)}</p>`}</div>`;
  const terminalAiAction = terminalPage && typeof terminalAiTopbarButtonHtml === "function" ? terminalAiTopbarButtonHtml() : "";
  const accountAction = `<div class="topbar-menu-wrap topbar-menu-wrap--account"><button class="token-pill account-avatar-button" id="open-account-menu" type="button" aria-haspopup="menu" aria-expanded="${topbarAccountMenuOpen ? "true" : "false"}" aria-label="Account menu" title="Account menu"><span class="topbar-avatar">${avatar}</span></button>${topbarAccountMenuOpen ? accountMenu() : ""}</div>`;
  const actions = `${terminalAiAction}${showNewChat ? `<button class="icon-button new-chat-button" id="clear-chat" type="button" aria-label="New chat" title="New chat">${icon("plus")}</button>` : ""}${activePage === "chat" ? `<div class="topbar-menu-wrap"><button class="icon-button chat-actions-button" id="open-chat-actions" type="button" aria-label="Chat actions" title="Chat actions">${icon("menu")}</button>${topbarChatMenuOpen ? chatActionMenu() : ""}</div>` : ""}${accountAction}`;
  nodes.topbar.classList.remove("terminal-preview-topbar");
  if (isElectronShell()) {
    nodes.topbar.innerHTML = "";
    if (nodes.chromePage) nodes.chromePage.innerHTML = center;
    if (nodes.chromeActions) nodes.chromeActions.innerHTML = `<div class="top-actions">${actions}</div>`;
    if (nodes.chromeStatus) nodes.chromeStatus.textContent = statusLabel();
  } else {
    if (nodes.chromePage) nodes.chromePage.innerHTML = "";
    if (nodes.chromeActions) nodes.chromeActions.innerHTML = "";
    nodes.topbar.innerHTML = `<div></div>${center}<div class="top-actions">${actions}</div>`;
  }
  document.getElementById("clear-chat")?.addEventListener("click", startNewChat);
  document.getElementById("open-account-menu")?.addEventListener("click", (event) => { event.stopPropagation(); topbarAccountMenuOpen = !topbarAccountMenuOpen; topbarChatMenuOpen = false; renderTopbar(); });
  document.querySelectorAll("[data-account-action]").forEach((button) => button.addEventListener("click", (event) => { event.stopPropagation(); handleAccountAction(button.dataset.accountAction); }));
  document.getElementById("open-chat-actions")?.addEventListener("click", (event) => { event.stopPropagation(); topbarChatMenuOpen = !topbarChatMenuOpen; topbarAccountMenuOpen = false; renderTopbar(); });
  document.querySelectorAll("[data-chat-action]").forEach((button) => button.addEventListener("click", () => handleChatAction(button.dataset.chatAction)));
  if (terminalPage && typeof bindPtyTopbarControls === "function") bindPtyTopbarControls();
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
  const label = pending ? "Review pairing" : paired ? "Phone connected" : "Pair phone";
  nodes.railStatus.innerHTML = `<button class="rail-status-card ${pending ? "pending" : paired ? "connected" : ""}" type="button" id="rail-pair" aria-label="${escapeAttribute(label)}" title="${escapeAttribute(label)}"><span class="rail-phone-icon">${icon(pending ? "clock" : "phone")}<span class="dot ${pending ? "warning" : paired ? "" : "offline"}"></span></span><span class="rail-status-copy"><strong>${escapeHtml(label)}</strong><small>${escapeHtml(pending ? "Approval needed" : paired ? currentState.pairedDevice : "Connect a device")}</small></span></button>`;
  document.getElementById("rail-pair")?.addEventListener("click", openPairModal);
}
