function renderDashboard() {
  const terminalRows = homeTerminalRows();
  const account = currentAccount();
  const firstName = String(account?.name || "").trim().split(/\s+/)[0];
  const firstWelcome = String(sessionStorage.getItem("vibyra.desktop.firstWelcomeUserId") || "")
    === String(account?.id || "");
  const welcome = firstWelcome
    ? (firstName ? `Welcome to Vibyra, ${firstName}.` : "Welcome to Vibyra.")
    : (firstName ? `Welcome back, ${firstName}.` : "Welcome back.");
  const workingTerminals = terminalRows.filter(homeTerminalIsWorking).length;
  const projects = (currentState.projects || []).slice(0, 4);
  const pendingPhone = currentState.pendingPair?.status === "pending";
  const phoneDetail = pendingPhone ? "Review pending request" : currentState.pairedDevice || "Pair this desktop";
  const terminalSummary = workingTerminals
    ? `${workingTerminals} working now`
    : terminalRows.length ? `${terminalRows.length} ready` : "None open";

  nodes.content.innerHTML = `
    <section class="desktop-home">
      <section class="desktop-home-hero" aria-label="Start with Vibyra">
        <h1>${escapeHtml(welcome)}</h1>
        <form class="desktop-home-command" id="home-ai-form">
          <span class="desktop-home-command-mark"><img src="/app-assets/vibyra.png" alt="" /></span>
          <textarea id="home-ai-input" aria-label="Ask Vibyra AI" placeholder="Ask Vibyra anything..." rows="1">${escapeHtml(chatDraft)}</textarea>
          <button class="desktop-home-command-send" id="home-ai-send" type="submit" aria-label="Send prompt" ${chatDraft.trim() && !chatSending ? "" : "disabled"}>${icon("send")}</button>
        </form>

        <nav class="desktop-home-context" aria-label="Desktop overview">
          ${homeStatusItem("phone", "Phone", homePhoneStatus(), "phone", phoneDetail)}
          ${homeStatusItem("terminal", "AI workspaces", terminalSummary, "terminals", terminalRows.length ? `${terminalRows.length} open` : "Launch a workspace", workingTerminals ? "working" : "")}
          ${homeStatusItem("folder", "Local projects", `${(currentState.projects || []).length} available`, "projects", "Ready on this desktop")}
        </nav>
      </section>

      <section class="desktop-home-recent">
        <div class="desktop-home-recent-head">
          <div><span>Recent work</span><h2>Pick up where you left off</h2></div>
          <button class="desktop-home-text-button" type="button" data-jump="terminals">All workspaces ${icon("arrow")}</button>
        </div>
        <div class="desktop-home-recent-grid">
          <section class="desktop-home-recent-column desktop-home-workspace">
            <div class="desktop-home-section-head">
              <div><span>${icon("terminal")}</span><h3>AI workspaces</h3></div>
              <small>${terminalRows.length} open</small>
            </div>
            ${terminalRows.length ? `<div class="desktop-home-terminal-list">${terminalRows.slice(0, 4).map(homeTerminalRow).join("")}</div>` : homeEmptyTerminals()}
          </section>

          <section class="desktop-home-recent-column desktop-home-projects">
            <div class="desktop-home-section-head">
              <div><span>${icon("folder")}</span><h3>Recent projects</h3></div>
              <button class="desktop-home-text-button" type="button" data-jump="projects">View all</button>
            </div>
            ${projects.length ? `<div class="desktop-home-project-list">${projects.map(homeProjectRow).join("")}</div>` : `<p class="desktop-home-quiet-empty">Projects discovered on this desktop will appear here.</p>`}
          </section>
        </div>
      </section>
    </section>`;
  bindJumps();
  bindDashboardActions();
}
function bindDashboardActions() {
  const homeForm = document.getElementById("home-ai-form");
  const homeInput = document.getElementById("home-ai-input");
  const homeSend = document.getElementById("home-ai-send");
  const resizeHomeInput = () => {
    if (!homeInput) return;
    homeInput.style.height = "auto";
    homeInput.style.height = `${Math.min(homeInput.scrollHeight, 120)}px`;
  };
  const updateHomePrompt = () => {
    if (!homeInput) return;
    chatDraft = homeInput.value;
    localStorage.setItem("vibyra.desktop.chatDraft", chatDraft);
    if (homeSend) homeSend.disabled = chatSending || !chatDraft.trim();
    resizeHomeInput();
  };
  const submitHomePrompt = () => {
    if (!homeInput || chatSending || !homeInput.value.trim()) return;
    chatDraft = homeInput.value.trim();
    localStorage.setItem("vibyra.desktop.chatDraft", chatDraft);
    setPage("chat");
    sendChat();
  };
  homeInput?.addEventListener("input", updateHomePrompt);
  homeInput?.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" || event.shiftKey) return;
    event.preventDefault();
    submitHomePrompt();
  });
  homeForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    submitHomePrompt();
  });
  resizeHomeInput();
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
  nodes.content.innerHTML = `<section class="projects-page"><div class="projects-board"><header class="projects-head"><div><span>Workspace</span><h1>Projects</h1></div><button class="primary-button" type="button" id="create-project">${icon("terminal")}Open terminal setup</button></header><div class="projects-controls"><label class="projects-search">${icon("search")}<input id="project-search" placeholder="Search projects" value="${escapeAttribute(projectQuery)}" /></label><div class="projects-filter" role="tablist" aria-label="Project source">${projectFilterModes.map((mode) => `<button class="${projectFilter === mode ? "active" : ""}" data-filter="${mode}" type="button" role="tab" aria-selected="${projectFilter === mode}">${mode}</button>`).join("")}</div><button class="projects-pair-button" type="button" id="browse-desktop" aria-label="${currentState.pairedDevice ? "Phone connected" : "Pair phone"}">${icon(currentState.pairedDevice ? "phone" : "link")}<span>${currentState.pairedDevice ? "Connected" : "Pair"}</span></button></div><section class="projects-list" aria-label="Project list"><div class="projects-list-head"><span>${projects.length} project${projects.length === 1 ? "" : "s"}</span><span>Name</span><span>Type</span><span>Source</span><span></span></div><div class="project-grid">${projects.length ? projects.map(projectCard).join("") : projectsEmptyStateHtml()}</div></section></div></section>`;
  document.getElementById("project-search").addEventListener("input", (event) => { projectQuery = event.target.value; renderProjects(); document.getElementById("project-search")?.focus(); });
  document.querySelectorAll("[data-filter]").forEach((button) => button.addEventListener("click", () => { projectFilter = button.dataset.filter; renderProjects(); }));
  document.querySelectorAll("[data-project-select]").forEach((button) => button.addEventListener("click", () => openProjectInTerminalSetup(button.dataset.projectSelect || "")));
  document.querySelectorAll("[data-project-terminal]").forEach((button) => button.addEventListener("click", () => openProjectInTerminalSetup(button.dataset.projectTerminal || "")));
  document.getElementById("create-project").addEventListener("click", () => openProjectInTerminalSetup(""));
  document.getElementById("browse-desktop").addEventListener("click", openPairModal);
  document.querySelectorAll("[data-projects-pair]").forEach((button) => button.addEventListener("click", openPairModal));
  bindProjectActions();
}
function renderChat() {
  if (activePage !== "chat" && typeof renderShellAiSidebar === "function") {
    renderShellAiSidebar();
    return;
  }
  const previousInput = document.getElementById("chat-input");
  const restoreFocus = document.activeElement === previousInput;
  const cursor = restoreFocus ? previousInput.selectionStart : chatDraft.length;
  const runCard = activeRunCard();
  const isEmptyChat = !chatMessages.length && !runCard;
  nodes.content.innerHTML = `<section class="chat-page${isEmptyChat ? " chat-page--empty" : ""}"><button class="chat-ai-corner" id="focus-vibyra-ai" type="button" aria-label="Focus Vibyra AI chat"><span class="chat-ai-corner-logo"><img src="/app-assets/vibyra.png" alt="" /></span><span><strong>Vibyra AI</strong><small>${chatSending ? "Thinking" : "Ready"}</small></span><i class="${chatSending ? "is-busy" : ""}"></i></button><div class="chat-scroll" id="chat-scroll">${isEmptyChat ? chatEmptyState() : `<div class="messages">${chatMessages.map(messageRow).join("")}${runCard}</div>`}</div><div class="composer-shell">${chatNoticeBanner()}<div class="composer"><div class="composer-context">${projectContextChip()}${attachmentChips()}${toolChip()}${skillChip()}</div><textarea id="chat-input" placeholder="Ask Vibyra anything..." rows="1">${escapeHtml(chatDraft)}</textarea>${slashMenu()}<input id="chat-attach" type="file" accept="*/*" multiple hidden /><div class="composer-bottom"><div class="composer-tools"><div class="tool-menu-wrap"><button class="icon-tool" id="open-attach-menu" type="button" aria-label="Attach context" title="Attach context">${icon("paperclip")}</button>${openChatMenu === "attach" ? attachMenu() : ""}</div><span class="chat-local-model" title="Uses local Ollama">${providerLogo("auto")}<span>Local</span></span></div><span class="composer-key-hint">Enter to send</span><button class="send-button" id="send-chat" type="button" aria-label="Send message" ${chatDraft.trim() && !chatSending ? "" : "disabled"}>${icon("send")}</button></div></div></div></section>`;
  document.querySelectorAll("[data-suggestion]").forEach((button) => button.addEventListener("click", () => { const input = document.getElementById("chat-input"); input.value = button.dataset.suggestion; chatDraft = input.value; localStorage.setItem("vibyra.desktop.chatDraft", chatDraft); input.focus(); renderSendState(); }));
  document.getElementById("clear-project")?.addEventListener("click", () => { selectedProjectId = ""; localStorage.removeItem("vibyra.desktop.project"); render(); });
  document.getElementById("clear-attachments")?.addEventListener("click", () => { chatAttachments = []; chatImageAttachments = []; renderChat(); });
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
  document.querySelectorAll("[data-attach-kind]").forEach((button) => button.addEventListener("click", () => openAttachmentPicker(button.dataset.attachKind)));
  document.querySelectorAll("[data-chat-tool]").forEach((button) => button.addEventListener("click", () => selectChatTool(button.dataset.chatTool)));
  document.querySelectorAll("[data-chat-skill]").forEach((button) => button.addEventListener("click", () => selectChatSkill(button.dataset.chatSkill)));
  document.querySelectorAll("[data-slash-command]").forEach((button) => button.addEventListener("click", () => applySlashCommand(button.dataset.slashCommand)));
  document.querySelectorAll("[data-slash-skill]").forEach((button) => button.addEventListener("click", () => selectChatSkill(button.dataset.slashSkill, true)));
  document.getElementById("send-chat").addEventListener("click", sendChat);
  document.getElementById("chat-input").addEventListener("input", (event) => { const wasSlashMenuOpen = Boolean(chatDraft.match(/^\/(\w*)$/)); chatDraft = event.target.value; localStorage.setItem("vibyra.desktop.chatDraft", chatDraft); const isSlashMenuOpen = Boolean(chatDraft.match(/^\/(\w*)$/)); isSlashMenuOpen || wasSlashMenuOpen ? renderChat() : renderSendState(); });
  document.getElementById("chat-input").addEventListener("keydown", (event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); sendChat(); } });
  bindChatTools();
  bindChatAttachmentDrop();
  bindGeneratedAppCards();
  requestAnimationFrame(() => {
    const input = document.getElementById("chat-input");
    renderSendState();
    if (restoreFocus && input) { input.focus(); input.setSelectionRange(cursor, cursor); }
    document.getElementById("chat-scroll")?.scrollTo(0, document.getElementById("chat-scroll").scrollHeight);
  });
}
