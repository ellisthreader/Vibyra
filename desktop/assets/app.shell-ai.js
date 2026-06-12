const shellAiWidthKey = "vibyra.desktop.shellAiWidth";
const shellAiDefaultWidth = 420;
const shellAiMinimumWidth = 360;
const shellAiMaximumWidth = 760;
const shellAiMinimumMainWidth = 520;
let shellAiWidth = Number(localStorage.getItem(shellAiWidthKey)) || shellAiDefaultWidth;

function shellAiTopbarButtonHtml() {
  if (activePage !== "projects") return "";
  return `<button class="shell-ai-topbar-button ${shellAiOpen ? "active" : ""}" id="open-shell-ai" type="button" aria-label="${shellAiOpen ? "Close Vibyra AI" : "Open Vibyra AI"}" aria-pressed="${shellAiOpen ? "true" : "false"}" title="Vibyra AI"><img src="/app-assets/vibyra.png" alt="" /></button>`;
}

function toggleShellAiSidebar() {
  shellAiOpen = !shellAiOpen;
  render();
}

function closeShellAiSidebar() {
  shellAiOpen = false;
  render();
}

function renderShellAiSidebar() {
  const panel = nodes.shellAiPanel;
  const app = document.querySelector(".app");
  const available = activePage === "projects";
  const open = available && shellAiOpen;
  app?.classList.toggle("shell-ai-open", open);
  panel.classList.toggle("open", open);
  panel.setAttribute("aria-hidden", open ? "false" : "true");
  if (!open) {
    panel.innerHTML = "";
    return;
  }
  applyShellAiWidth(app, panel);

  const rows = chatMessages.length
    ? chatMessages.map(shellAiMessageHtml).join("")
    : shellAiEmptyHtml();
  panel.innerHTML = `
    <button class="shell-ai-resizer" type="button" role="separator" aria-label="Resize Vibyra AI sidebar" aria-orientation="vertical" data-shell-ai-resizer></button>
    <header class="shell-ai-header">
      <div><span><img src="/app-assets/vibyra.png" alt="" /></span><strong>Vibyra AI</strong></div>
      <nav>
        <button type="button" id="shell-ai-new" aria-label="New chat" title="New chat">${icon("plus")}</button>
        <button type="button" id="shell-ai-close" aria-label="Close Vibyra AI" title="Close">${icon("close")}</button>
      </nav>
    </header>
    <div class="shell-ai-messages" id="shell-ai-messages">${rows}</div>
    <div class="shell-ai-composer-wrap">
      ${chatNoticeBanner()}
      <form class="shell-ai-composer" id="shell-ai-form">
        <div class="shell-ai-context">${projectContextChip()}${attachmentChips()}${skillChip()}</div>
        <textarea id="chat-input" rows="1" placeholder="Ask Vibyra AI...">${escapeHtml(chatDraft)}</textarea>
        ${slashMenu()}
        <input id="chat-attach" type="file" accept="*/*" multiple hidden />
        <footer>
          <button class="shell-ai-tool" id="open-attach-menu" type="button" aria-label="Attach context" title="Attach context">${icon("paperclip")}</button>
          ${openChatMenu === "attach" ? attachMenu() : ""}
          <span class="shell-ai-local-model" title="Uses local Ollama">${providerLogo("auto")}<span>Local</span></span>
          <button class="shell-ai-send" id="send-chat" type="submit" aria-label="Send message" ${chatDraft.trim() && !chatSending ? "" : "disabled"}>${icon("send")}</button>
        </footer>
      </form>
    </div>`;
  bindShellAiSidebar();
}

function shellAiWidthBounds(appWidth) {
  const width = Number(appWidth) || window.innerWidth || shellAiDefaultWidth;
  const overlay = width <= 1050;
  return {
    minimum: shellAiMinimumWidth,
    maximum: Math.max(
      shellAiMinimumWidth,
      Math.min(
        shellAiMaximumWidth,
        overlay ? width - 24 : width - shellAiMinimumMainWidth
      )
    )
  };
}

function clampShellAiWidth(value, appWidth) {
  const bounds = shellAiWidthBounds(appWidth);
  const width = Number(value) || shellAiDefaultWidth;
  return Math.round(Math.min(bounds.maximum, Math.max(bounds.minimum, width)));
}

function applyShellAiWidth(app = document.querySelector(".app"), panel = nodes?.shellAiPanel) {
  if (!app || !panel) return;
  shellAiWidth = clampShellAiWidth(shellAiWidth, app.clientWidth);
  app.style.setProperty("--shell-ai-width", `${shellAiWidth}px`);
  const separator = panel.querySelector("[data-shell-ai-resizer]");
  if (separator) {
    const bounds = shellAiWidthBounds(app.clientWidth);
    separator.setAttribute("aria-valuemin", String(bounds.minimum));
    separator.setAttribute("aria-valuemax", String(bounds.maximum));
    separator.setAttribute("aria-valuenow", String(shellAiWidth));
  }
}

function bindShellAiResizer(panel = nodes?.shellAiPanel) {
  const separator = panel?.querySelector?.("[data-shell-ai-resizer]");
  const app = document.querySelector(".app");
  if (!separator || !app || separator.dataset.shellAiResizerBound) return;
  applyShellAiWidth(app, panel);
  separator.dataset.shellAiResizerBound = "1";
  separator.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    separator.setPointerCapture?.(event.pointerId);
    app.classList.add("shell-ai-resizing");
    const startX = event.clientX;
    const startWidth = shellAiWidth;
    const move = (moveEvent) => {
      shellAiWidth = clampShellAiWidth(startWidth + startX - moveEvent.clientX, app.clientWidth);
      applyShellAiWidth(app, panel);
    };
    const stop = () => {
      separator.removeEventListener("pointermove", move);
      separator.removeEventListener("pointerup", stop);
      separator.removeEventListener("pointercancel", stop);
      app.classList.remove("shell-ai-resizing");
      localStorage.setItem(shellAiWidthKey, String(shellAiWidth));
    };
    separator.addEventListener("pointermove", move);
    separator.addEventListener("pointerup", stop);
    separator.addEventListener("pointercancel", stop);
  });
  separator.addEventListener("keydown", (event) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const bounds = shellAiWidthBounds(app.clientWidth);
    if (event.key === "Home") shellAiWidth = bounds.minimum;
    else if (event.key === "End") shellAiWidth = bounds.maximum;
    else shellAiWidth += event.key === "ArrowLeft" ? 24 : -24;
    shellAiWidth = clampShellAiWidth(shellAiWidth, app.clientWidth);
    applyShellAiWidth(app, panel);
    localStorage.setItem(shellAiWidthKey, String(shellAiWidth));
  });
}

function shellAiEmptyHtml() {
  const project = currentProject();
  return `<div class="shell-ai-empty">
    <img src="/app-assets/vibyra.png" alt="" />
    <strong>How can Vibyra help?</strong>
    <p>${project ? `Ask about ${escapeHtml(project.name)} or hand off a task.` : "Ask a question or hand off a task."}</p>
    <button type="button" data-shell-ai-prompt="Review ${project ? "this project" : "my desktop"} and suggest the most useful next step.">${icon("arrow")}<span>Plan my next step</span>${icon("chevron")}</button>
    <button type="button" data-shell-ai-prompt="Find the highest-priority issue and explain the safest fix.">${icon("search")}<span>Review active work</span>${icon("chevron")}</button>
  </div>`;
}

function shellAiMessageHtml(message, index) {
  const assistant = message.role === "assistant";
  const image = normalizeChatImage(message.image);
  const app = normalizeChatApp(message.app);
  return `<article class="shell-ai-message ${assistant ? "assistant" : "user"}">
    ${assistant ? `<span><img src="/app-assets/vibyra.png" alt="" /></span>` : ""}
    <div>${message.pending ? `<i></i><i></i><i></i>` : `<p>${escapeHtml(message.text)}</p>${image ? `<img class="shell-ai-image" src="${escapeAttribute(image.url)}" alt="${escapeAttribute(image.title)}" />` : ""}${app ? `<button class="shell-ai-app" type="button" data-open-app="${index}">${icon("play")}Open ${escapeHtml(app.title)}</button>` : ""}`}</div>
  </article>`;
}

function bindShellAiSidebar() {
  const input = document.getElementById("chat-input");
  bindShellAiResizer();
  document.getElementById("shell-ai-close")?.addEventListener("click", closeShellAiSidebar);
  document.getElementById("shell-ai-new")?.addEventListener("click", startNewChat);
  document.getElementById("shell-ai-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    sendChat();
  });
  input?.addEventListener("input", (event) => {
    const hadSlash = Boolean(chatDraft.match(/^\/(\w*)$/));
    chatDraft = event.target.value;
    localStorage.setItem("vibyra.desktop.chatDraft", chatDraft);
    const hasSlash = Boolean(chatDraft.match(/^\/(\w*)$/));
    hasSlash || hadSlash ? renderShellAiSidebar() : renderSendState();
  });
  input?.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      sendChat();
    }
  });
  document.querySelectorAll("[data-shell-ai-prompt]").forEach((button) => button.addEventListener("click", () => {
    chatDraft = button.dataset.shellAiPrompt || "";
    localStorage.setItem("vibyra.desktop.chatDraft", chatDraft);
    renderShellAiSidebar();
  }));
  document.getElementById("open-attach-menu")?.addEventListener("click", () => toggleChatMenu("attach"));
  document.querySelectorAll("[data-attach-kind]").forEach((button) => button.addEventListener("click", () => openAttachmentPicker(button.dataset.attachKind)));
  document.querySelectorAll("[data-slash-command]").forEach((button) => button.addEventListener("click", () => applySlashCommand(button.dataset.slashCommand)));
  document.querySelectorAll("[data-slash-skill]").forEach((button) => button.addEventListener("click", () => selectChatSkill(button.dataset.slashSkill, true)));
  document.getElementById("clear-project")?.addEventListener("click", () => {
    selectedProjectId = "";
    localStorage.removeItem("vibyra.desktop.project");
    render();
  });
  document.getElementById("clear-attachments")?.addEventListener("click", () => {
    chatAttachments = [];
    chatImageAttachments = [];
    renderShellAiSidebar();
  });
  document.getElementById("clear-skill")?.addEventListener("click", () => {
    activeChatSkill = "";
    renderShellAiSidebar();
  });
  document.getElementById("dismiss-chat-notice")?.addEventListener("click", () => {
    chatNotice = null;
    renderShellAiSidebar();
  });
  bindChatTools();
  bindGeneratedAppCards();
  renderSendState();
  requestAnimationFrame(() => {
    const messages = document.getElementById("shell-ai-messages");
    messages?.scrollTo(0, messages.scrollHeight);
    input?.focus();
  });
}

window.addEventListener("resize", () => {
  if (!shellAiOpen) return;
  applyShellAiWidth();
});
