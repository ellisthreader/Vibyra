let terminalCompanionMode = "";
let terminalPhonePreviewStatus = "";
let terminalPhonePreviewOpening = false;
let terminalCompanionReturnFocusId = "";
let terminalCompanionContextKey = "";
let terminalCompanionSyncing = false;
let terminalCompanionSyncQueued = false;
let terminalCompanionSwitchGeneration = 0;
let terminalCompanionRailRestoreCollapsed = null;
let terminalCompanionFocusSection = "";
const terminalCompanionModes = new Set(["chat", "phone", "voice", "memory"]);
const terminalCompanionCommands = {
  "/phone": "phone",
  "/voice": "voice",
  "/memory": "memory",
  "/memories": "memory"
};
const terminalPhonePtyBuffers = {};

function terminalCompanionToolbarHtml() {
  return "";
}

function terminalAiTopbarButtonHtml() {
  const active = terminalCompanionMode === "chat" || terminalCompanionMode === "voice";
  return `<button class="terminal-ai-topbar-button ${active ? "active" : ""}" type="button" data-terminal-companion-open="chat" aria-label="Open Vibyra AI chat" aria-pressed="${active ? "true" : "false"}" title="Open Vibyra AI"><img src="/app-assets/vibyra.png" alt=""></button>`;
}

function terminalCompanionStandaloneToolbarHtml() {
  return "";
}

function bindTerminalCompanionLaunchers(root = document) {
  root.querySelectorAll?.("[data-terminal-companion-open]").forEach((button) => {
    if (button.dataset.terminalCompanionBound) return;
    button.dataset.terminalCompanionBound = "1";
    button.addEventListener("click", () => {
      const mode = button.dataset.terminalCompanionOpen || "";
      if (terminalCompanionMode === mode) closeTerminalCompanionPanel();
      else openTerminalCompanionPanel(mode, "toolbar");
    });
  });
  syncTerminalCompanionLaunchers();
}

function syncTerminalCompanionLaunchers() {
  document.querySelectorAll?.("[data-terminal-companion-open]").forEach((button) => {
    const active = button.dataset.terminalCompanionOpen === terminalCompanionMode;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", active ? "true" : "false");
  });
}

function openTerminalCompanionPanel(mode = "", source = "terminal") {
  const wasOpen = terminalCompanionModes.has(terminalCompanionMode);
  terminalCompanionReturnFocusId = terminalCompanionActiveTerminal()?.id || activeTerminalId || "";
  terminalCompanionFocusSection = mode === "memory" ? "memory" : mode;
  terminalCompanionMode = mode === "memory" ? "chat" : terminalCompanionModes.has(mode) ? mode : "";
  if (terminalCompanionMode) syncTerminalCompanionRail(true, wasOpen);
  syncTerminalCompanionLaunchers();
  if (activePage !== "terminals") {
    setPage("terminals");
    return;
  }
  if (!syncTerminalCompanion(source)) render();
}

function openTerminalPhonePanel(source = "terminal") {
  openTerminalCompanionPanel("phone", source);
}

function closeTerminalCompanionPanel() {
  if (terminalCompanionMode === "voice" && typeof stopTerminalVoiceForPanelClose === "function") {
    stopTerminalVoiceForPanelClose();
  }
  terminalCompanionMode = "";
  syncTerminalCompanionRail(false);
  syncTerminalCompanionLaunchers();
  syncTerminalCompanion("close");
  if (terminalCompanionReturnFocusId && typeof focusPtyTerminal === "function") {
    requestAnimationFrame(() => focusPtyTerminal(terminalCompanionReturnFocusId));
  }
}

function syncTerminalCompanionRail(open, wasOpen = false) {
  const app = document.querySelector(".app");
  if (!app || typeof setRailCollapsed !== "function") return;
  if (open) {
    if (!wasOpen && terminalCompanionRailRestoreCollapsed === null) {
      terminalCompanionRailRestoreCollapsed = Boolean(railCollapsed);
    }
    app.classList.add("terminal-companion-active");
    setRailCollapsed(true, { persist: false, force: true });
    return;
  }
  app.classList.remove("terminal-companion-active");
  const restoreCollapsed = terminalCompanionRailRestoreCollapsed;
  terminalCompanionRailRestoreCollapsed = null;
  if (restoreCollapsed !== null) {
    setRailCollapsed(restoreCollapsed, { persist: false, force: true });
  }
}

function closeTerminalPhonePanel() {
  closeTerminalCompanionPanel();
}

function terminalCompanionActiveTerminal() {
  return findTerminal(activeTerminalId) || terminals[0] || null;
}

function terminalCompanionInsertIntoActiveTerminal(text = "", submit = false) {
  const terminal = terminalCompanionActiveTerminal();
  return terminalCompanionInsertIntoTerminal(terminal?.id || activeTerminalId || "", text, submit);
}

function terminalCompanionInsertIntoTerminal(id, text = "", submit = false) {
  const terminal = findTerminal(id);
  if (!id) return false;
  const safeId = window.CSS?.escape ? CSS.escape(id) : id.replace(/\"/g, "\\\"");
  const selector = `[data-terminal-draft="${safeId}"]`;
  const field = nodes?.content?.querySelector(selector);
  if (field && terminal) {
    const nextText = String(text || "");
    const spacer = field.value && !/\s$/.test(field.value) ? " " : "";
    field.value = nextText ? `${field.value}${spacer}${nextText}` : field.value;
    terminal.draft = field.value;
    terminal.updatedAt = Date.now();
    saveTerminals();
    fitTerminalDraft(field);
    updateTerminalCommandPalette(field, terminal);
    if (submit) sendTerminal(id);
    return true;
  }
  if (typeof focusPtyTerminal === "function") focusPtyTerminal(id);
  if (typeof sendPtyInput === "function") {
    const nextText = String(text || "");
    if (nextText) sendPtyInput(id, `\x1b[200~${nextText.replace(/\r?\n/g, "\r")}\x1b[201~`);
    if (submit) sendPtyInput(id, "\r");
    return true;
  }
  return false;
}

function terminalCompanionHtml() {
  const terminal = terminalCompanionActiveTerminal();
  const project = projectForTerminal(terminal) || currentProject();
  const preview = currentState.latestPreview || {};
  const previewUrl = preview.url || "";
  const launchDisabled = terminalPhonePreviewOpening ? "disabled" : "";
  const topToolHtml = terminalCompanionMode === "chat" && typeof terminalAiChatHtml === "function"
    ? terminalAiChatHtml()
    : terminalCompanionMode === "voice" && typeof terminalVoiceHtml === "function"
      ? terminalVoiceHtml()
      : terminalCompanionMode === "memory" && typeof terminalMemoryHtml === "function"
        ? terminalMemoryHtml()
        : "";
  const stacked = terminalCompanionMode === "chat" || terminalCompanionMode === "voice";
  const memoryHtml = stacked && typeof terminalMemoryHtml === "function" ? terminalMemoryHtml() : "";
  const modeClass = `terminal-companion--${terminalCompanionMode}`;
  const panelClass = terminalCompanionMode === "phone" ? "terminal-phone-section" : `terminal-${terminalCompanionMode}-section`;
  const panelData = terminalCompanionMode === "phone" ? "data-terminal-phone-panel" : `data-terminal-${terminalCompanionMode}-panel`;
  return `<aside class="terminal-companion ${modeClass}" data-terminal-companion data-terminal-companion-mode="${escapeAttribute(terminalCompanionMode)}" aria-label="Vibyra AI">
    <button class="terminal-companion-resizer" type="button" role="separator" aria-label="Resize Vibyra AI sidebar" aria-orientation="vertical" tabindex="0" data-terminal-companion-resizer></button>
    <header class="terminal-companion-shell-head">
      <div class="terminal-companion-brand">${icon("sparkles")}<span><strong>Vibyra AI</strong><small>${escapeHtml(terminal?.title || project?.name || "Terminal tools")}</small></span></div>
      <button class="terminal-companion-close" type="button" data-terminal-companion-close aria-label="Close Vibyra AI">${icon("close")}</button>
    </header>
    ${stacked ? `<div class="terminal-companion-stack">
      <section class="terminal-companion-section terminal-companion-primary ${panelClass} active" ${panelData}>${topToolHtml}</section>
      <section class="terminal-companion-section terminal-memory-section terminal-memory-section--stacked active" data-terminal-memory-panel>${memoryHtml}</section>
    </div>` : `<section class="terminal-companion-section ${panelClass} active" ${panelData}>
      ${terminalCompanionMode === "phone" ? `
      <div class="terminal-phone-host" data-phone-preview-host>
        <div class="terminal-phone-shell" aria-hidden="true"><span></span><i></i></div>
        <div class="terminal-phone-copy">
          <strong>${escapeHtml(project?.name || "No project selected")}</strong>
          <small>${previewUrl ? escapeHtml(previewUrl) : "Ready for the existing PhonePreview helper."}</small>
        </div>
        <button class="terminal-phone-launch" type="button" data-terminal-phone-launch ${launchDisabled}>${icon("play")}<span>${terminalPhonePreviewOpening ? "Opening..." : "Open PhonePreview"}</span></button>
        ${terminalPhonePreviewStatus ? `<p class="terminal-phone-status">${escapeHtml(terminalPhonePreviewStatus)}</p>` : ""}
      </div>` : topToolHtml}
    </section>`}
  </aside>`;
}

function syncTerminalCompanion(source = "") {
  if (activePage !== "terminals" || !nodes?.content) return false;
  if (terminalCompanionSyncing) {
    terminalCompanionSyncQueued = true;
    return true;
  }
  syncTerminalCompanionLaunchers();
  const page = nodes.content.querySelector(".terminal-page") || nodes.content.querySelector(".terminal-setup");
  if (!page) return false;
  const setupMode = page.classList.contains("terminal-setup");
  const existing = page.querySelector("[data-terminal-companion]");
  if (!terminalCompanionModes.has(terminalCompanionMode)) {
    page.classList.remove("terminal-page--with-companion", "terminal-setup--with-companion", "terminal-page--phone-open", "terminal-setup--phone-open");
    delete page.dataset.terminalCompanionMode;
    existing?.remove();
    scheduleTerminalCompanionFit();
    return true;
  }
  syncTerminalCompanionContext();
  page.classList.remove(setupMode ? "terminal-page--with-companion" : "terminal-setup--with-companion");
  page.classList.add(setupMode ? "terminal-setup--with-companion" : "terminal-page--with-companion");
  page.dataset.terminalCompanionMode = terminalCompanionMode;
  page.classList.toggle("terminal-page--phone-open", !setupMode && terminalCompanionMode === "phone");
  page.classList.toggle("terminal-setup--phone-open", setupMode && terminalCompanionMode === "phone");
  if (existing && existing.dataset.terminalCompanionMode === terminalCompanionMode && !source) {
    bindTerminalCompanion();
    return true;
  }
  const focus = captureTerminalCompanionFocus(existing);
  terminalCompanionSyncing = true;
  try {
    if (existing) existing.outerHTML = terminalCompanionHtml();
    else page.insertAdjacentHTML("beforeend", terminalCompanionHtml());
    bindTerminalCompanion();
    restoreTerminalCompanionFocus(focus);
  } finally {
    terminalCompanionSyncing = false;
  }
  scheduleTerminalCompanionFit();
  if (source && !["voice", "memory", "close"].includes(source) && !focus) {
    const focusSelector = terminalCompanionFocusSection === "memory"
      ? "[data-terminal-memory-search], [data-terminal-memory-new-note]"
      : terminalCompanionMode === "chat"
      ? "[data-terminal-ai-input]"
      : "[data-terminal-companion] button, [data-terminal-companion] textarea";
    requestAnimationFrame(() => page.querySelector(focusSelector)?.focus?.());
  }
  terminalCompanionFocusSection = "";
  if (terminalCompanionSyncQueued) {
    terminalCompanionSyncQueued = false;
    requestAnimationFrame(() => syncTerminalCompanion());
  }
  return true;
}

function syncTerminalCompanionContext() {
  const terminal = terminalCompanionActiveTerminal();
  const nextKey = `${terminal?.id || ""}:${terminal?.projectId || ""}`;
  if (nextKey === terminalCompanionContextKey) return;
  terminalCompanionContextKey = nextKey;
  if (typeof syncTerminalVoiceTarget === "function") syncTerminalVoiceTarget(terminal);
  if (terminalCompanionMode && typeof terminalMemoryEnsureProject === "function") {
    terminalMemoryEnsureProject(terminal?.projectId || "");
  }
  window.dispatchEvent(new CustomEvent("vibyra:terminal-companion-context", {
    detail: { mode: terminalCompanionMode, terminalId: terminal?.id || "", projectId: terminal?.projectId || "" }
  }));
}

function scheduleTerminalCompanionFit() {
  const schedule = window.requestAnimationFrame || ((callback) => setTimeout(callback, 16));
  schedule(() => {
    if (typeof mountVisibleXterms === "function") mountVisibleXterms();
    document.querySelectorAll("[data-terminal-xterm]").forEach((node) => {
      const id = node.dataset.terminalXterm || "";
      if (id && typeof fitPtyXterm === "function") fitPtyXterm(id, node);
    });
  });
}
