function renderDashboard() {
  const terminalRows = homeTerminalRows();
  const activeWork = liveBuildRows();
  const events = dashboardActivityEvents();
  nodes.content.innerHTML = `<section class="home-page"><header class="home-welcome"><div><p>${escapeHtml(currentState.machineName || "Vibyra Desktop")}</p><h1>Your workspace at a glance.</h1></div><button class="primary-button home-new-chat" type="button" data-jump="chat">${icon("plus")}New chat</button></header><div class="home-status-strip">${homeStatusItem("phone", "Phone", homePhoneStatus(), "phone")}${homeStatusItem("terminal", "Terminals", `${terminalRows.length} open`, "terminals")}${homeStatusItem("folder", "Projects", `${(currentState.projects || []).length} local`, "projects")}</div><div class="home-grid"><section class="home-panel home-terminals"><div class="home-panel-head"><div><span>Live workspace</span><h2>Terminals</h2></div><button class="home-text-button" type="button" data-jump="terminals">Open terminals ${icon("arrow")}</button></div>${activeWork.length ? homeActiveWorkRow(activeWork[0]) : ""}${terminalRows.length ? `<div class="home-terminal-list">${terminalRows.slice(0, 5).map(homeTerminalRow).join("")}</div>` : homeEmptyTerminals()}</section><aside class="home-side">${homePhonePanel()}${homeProjectsPanel()}</aside></div>${events.length ? `<section class="home-panel home-activity"><div class="home-panel-head"><div><span>Latest</span><h2>Recent activity</h2></div></div><div class="home-activity-list">${dashboardActivityRows(events.slice(0, 4))}</div></section>` : ""}</section>`;
  bindJumps();
  bindDashboardActions();
}
function bindDashboardActions() {
  document.querySelectorAll("[data-home-phone]").forEach((button) => button.addEventListener("click", openPairModal));
  document.querySelectorAll("[data-home-terminal]").forEach((button) => button.addEventListener("click", () => {
    if (typeof activeTerminalId !== "undefined") activeTerminalId = button.dataset.homeTerminal || activeTerminalId;
    setPage("terminals");
  }));
  document.querySelectorAll("[data-home-project]").forEach((button) => button.addEventListener("click", () => {
    selectedProjectId = button.dataset.homeProject || "";
    if (selectedProjectId) localStorage.setItem("vibyra.desktop.project", selectedProjectId);
    setPage("projects");
  }));
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
  const isEmptyChat = !chatMessages.length && !runCard;
  nodes.content.innerHTML = `<section class="chat-page${isEmptyChat ? " chat-page--empty" : ""}"><button class="chat-ai-corner" id="focus-vibyra-ai" type="button" aria-label="Focus Vibyra AI chat"><span class="chat-ai-corner-logo"><img src="/app-assets/vibyra.png" alt="" /></span><span><strong>Vibyra AI</strong><small>${chatSending ? "Thinking" : "Ready"}</small></span><i class="${chatSending ? "is-busy" : ""}"></i></button><div class="chat-scroll" id="chat-scroll">${isEmptyChat ? chatEmptyState() : `<div class="messages">${chatMessages.map(messageRow).join("")}${runCard}</div>`}</div><div class="composer-shell">${chatNoticeBanner()}<div class="composer"><div class="composer-context">${projectContextChip()}${attachmentChips()}${toolChip()}${skillChip()}</div><textarea id="chat-input" placeholder="Ask Vibyra anything..." rows="1">${escapeHtml(chatDraft)}</textarea>${slashMenu()}<input id="chat-attach" type="file" accept="*/*" multiple hidden /><div class="composer-bottom"><div class="composer-tools"><div class="tool-menu-wrap"><button class="icon-tool" id="open-attach-menu" type="button" aria-label="Attach context" title="Attach context">${icon("paperclip")}</button>${openChatMenu === "attach" ? attachMenu() : ""}</div><div class="tool-menu-wrap ai-menu-wrap"><button class="tool-pill quiet ai-selector" id="open-ai-menu" type="button" aria-haspopup="dialog" aria-expanded="${openChatMenu === "ai" ? "true" : "false"}"><span class="ai-selector-icon">${providerLogo(currentChatModel().provider)}</span><span class="ai-selector-copy"><strong>${escapeHtml(currentChatModel().label)}</strong><small>${escapeHtml(currentEffort().label)}</small></span>${icon("chevron-down")}</button>${openChatMenu === "ai" ? aiMenu() : ""}</div></div><span class="composer-key-hint">Enter to send</span><button class="send-button" id="send-chat" type="button" aria-label="Send message" ${chatDraft.trim() && !chatSending ? "" : "disabled"}>${icon("send")}</button></div></div></div></section>`;
  document.querySelectorAll("[data-suggestion]").forEach((button) => button.addEventListener("click", () => { const input = document.getElementById("chat-input"); input.value = button.dataset.suggestion; chatDraft = input.value; localStorage.setItem("vibyra.desktop.chatDraft", chatDraft); input.focus(); renderSendState(); }));
  document.getElementById("clear-project")?.addEventListener("click", () => { selectedProjectId = ""; localStorage.removeItem("vibyra.desktop.project"); render(); });
  document.getElementById("clear-attachments")?.addEventListener("click", () => { chatAttachments = []; renderChat(); });
  document.getElementById("clear-tool")?.addEventListener("click", () => { activeChatTool = ""; renderChat(); });
  document.getElementById("clear-skill")?.addEventListener("click", () => { activeChatSkill = ""; renderChat(); });
  document.getElementById("dismiss-chat-notice")?.addEventListener("click", () => { chatNotice = null; renderChat(); });
  document.getElementById("focus-vibyra-ai")?.addEventListener("click", () => {
    openChatMenu = "";
    const input = document.getElementById("chat-input");
    input?.scrollIntoView({ behavior: "smooth", block: "center" });
    input?.focus({ preventScroll: true });
  });
  document.getElementById("open-attach-menu")?.addEventListener("click", () => toggleChatMenu("attach"));
  document.getElementById("open-ai-menu")?.addEventListener("click", () => toggleChatMenu("ai"));
  document.querySelectorAll("[data-model-group]").forEach((button) => button.addEventListener("click", () => selectModelMenuGroup(button.dataset.modelGroup)));
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
