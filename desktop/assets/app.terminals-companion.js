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
const terminalCompanionModes = new Set(["editor", "preview", "chat", "phone", "memory"]);
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
  const active = terminalCompanionModes.has(terminalCompanionMode);
  return `<button class="terminal-sidebar-topbar-button ${active ? "active" : ""}" type="button" data-terminal-companion-toggle aria-label="${active ? "Close right sidebar" : "Open right sidebar"}" aria-pressed="${active ? "true" : "false"}" title="${active ? "Close sidebar" : "Open sidebar"}">${icon("sidebar")}</button>`;
}
function terminalCompanionStandaloneToolbarHtml() {
  return "";
}
function bindTerminalCompanionLaunchers(root = document) {
  root.querySelectorAll?.("[data-terminal-companion-toggle]").forEach((button) => {
    if (button.dataset.terminalCompanionToggleBound) return;
    button.dataset.terminalCompanionToggleBound = "1";
    button.addEventListener("click", () => {
      if (terminalCompanionModes.has(terminalCompanionMode)) closeTerminalCompanionPanel();
      else openTerminalCompanionPanel("chat", "toolbar");
    });
  });
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
  const open = terminalCompanionModes.has(terminalCompanionMode);
  document.querySelectorAll?.("[data-terminal-companion-toggle]").forEach((button) => {
    button.classList.toggle("active", open);
    button.setAttribute("aria-pressed", open ? "true" : "false");
    button.setAttribute("aria-label", open ? "Close right sidebar" : "Open right sidebar");
    button.title = open ? "Close sidebar" : "Open sidebar";
  });
  document.querySelectorAll?.("[data-terminal-companion-open]").forEach((button) => {
    const active = button.dataset.terminalCompanionOpen === terminalCompanionMode;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", active ? "true" : "false");
  });
}

function openTerminalCompanionPanel(mode = "", source = "terminal") {
  const wasOpen = terminalCompanionModes.has(terminalCompanionMode);
  if (terminalCompanionMode === "chat"
    && mode !== "chat"
    && typeof terminalAiSurface !== "undefined"
    && terminalAiSurface === "voice"
    && typeof stopTerminalVoiceForPanelClose === "function") {
    stopTerminalVoiceForPanelClose();
  }
  terminalCompanionReturnFocusId = terminalCompanionActiveTerminal()?.id || activeTerminalId || "";
  terminalCompanionFocusSection = mode;
  terminalCompanionMode = terminalCompanionModes.has(mode) ? mode : "";
  if (terminalCompanionMode) syncTerminalCompanionRail(true, wasOpen);
  syncTerminalCompanionLaunchers();
  if (activePage !== "terminals") {
    setPage("terminals");
    return;
  }
  if (!syncTerminalCompanion(source)) render();
  if (terminalCompanionMode === "editor" && typeof openTerminalEditorWorkspace === "function") {
    queueMicrotask(() => openTerminalEditorWorkspace(terminalCompanionActiveTerminal()?.id || activeTerminalId));
  }
}

function openTerminalPhonePanel(source = "terminal") {
  openTerminalCompanionPanel("phone", source);
}

function closeTerminalCompanionPanel() {
  if (terminalCompanionMode === "chat"
    && typeof terminalAiSurface !== "undefined"
    && terminalAiSurface === "voice"
    && typeof stopTerminalVoiceForPanelClose === "function") {
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

function terminalCompanionInsertIntoTerminal(id, text = "", submit = false, options = {}) {
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
    if (submit) sendTerminal(id, {
      logPrompt: options.logPrompt !== false,
      transcriptSource: options.transcriptSource,
      transcriptTurn: options.transcriptTurn
    });
    return true;
  }
  if (typeof focusPtyTerminal === "function") focusPtyTerminal(id);
  if (typeof sendPtyInput === "function") {
    const nextText = String(text || "");
    if (options.transcriptTurn && typeof terminalPtyTrackTurn === "function") {
      terminalPtyTrackTurn(id, nextText, options.transcriptTurn, options.transcriptSource);
    }
    if (nextText) sendPtyInput(id, `\x1b[200~${nextText.replace(/\r?\n/g, "\r")}\x1b[201~`, { logPrompt: options.logPrompt !== false });
    if (submit) sendPtyInput(id, "\r", { logPrompt: options.logPrompt !== false });
    return true;
  }
  return false;
}

function terminalCompanionHtml(options = {}) {
  const displayTerminal = terminalCompanionDisplayTerminal();
  const project = projectForTerminal(displayTerminal);
  const preview = currentState.latestPreview || {};
  const previewUrl = preview.url || "";
  const launchDisabled = terminalPhonePreviewOpening ? "disabled" : "";
  const topToolHtml = terminalCompanionMode === "preview" && typeof terminalTestWorkspaceHtml === "function"
    ? terminalTestWorkspaceHtml()
    : terminalCompanionMode === "editor" && typeof terminalEditorHtml === "function"
      ? terminalEditorHtml(displayTerminal)
    : terminalCompanionMode === "chat" && typeof terminalAiChatHtml === "function"
      ? terminalAiChatHtml()
      : terminalCompanionMode === "memory" && typeof terminalMemoryHtml === "function"
        ? terminalMemoryHtml(displayTerminal)
        : "";
  const modeClass = `terminal-companion--${terminalCompanionMode}`;
  const enteringClass = options.entering ? " terminal-companion--entering" : "";
  const panelClass = terminalCompanionMode === "phone" ? "terminal-phone-section" : `terminal-${terminalCompanionMode}-section`;
  const panelData = terminalCompanionMode === "phone" ? "data-terminal-phone-panel" : `data-terminal-${terminalCompanionMode}-panel`;
  return `<aside class="terminal-companion ${modeClass}${enteringClass}" data-terminal-companion data-terminal-companion-mode="${escapeAttribute(terminalCompanionMode)}" aria-label="Right workspace">
    <button class="terminal-companion-resizer" type="button" role="separator" aria-label="Resize Vibyra AI sidebar" aria-orientation="vertical" tabindex="0" data-terminal-companion-resizer></button>
    ${terminalCompanionModeNavHtml()}
    <section class="terminal-companion-section terminal-companion-primary ${panelClass} active" ${panelData}>
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
    </section>
  </aside>`;
}

function terminalCompanionModeNavHtml() {
  const modes = [
    ["editor", "code", "Editor"],
    ["preview", "preview", "Preview"],
    ["chat", "sparkles", "AI"],
    ["memory", "document", "Memory"]
  ];
  return `<nav class="terminal-companion-shell-actions" aria-label="Right workspace">
    <div class="terminal-companion-tabs">
      ${modes.map(([mode, iconName, label]) => `<button class="${terminalCompanionMode === mode ? "active" : ""}" type="button" data-terminal-companion-open="${mode}" aria-pressed="${terminalCompanionMode === mode}">${icon(iconName)}<span>${label}</span></button>`).join("")}
    </div>
    <button class="terminal-companion-close" type="button" data-terminal-companion-close aria-label="Close right workspace" title="Close sidebar">${icon("close")}</button>
  </nav>`;
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
    if (existing?.dataset.terminalCompanionMode === "editor"
      && typeof terminalEditorPrepareRemount === "function") {
      terminalEditorPrepareRemount();
    }
    if (existing) existing.outerHTML = terminalCompanionHtml();
    else page.insertAdjacentHTML("beforeend", terminalCompanionHtml({ entering: true }));
    bindTerminalCompanion();
    restoreTerminalCompanionFocus(focus);
  } finally {
    terminalCompanionSyncing = false;
  }
  scheduleTerminalCompanionFit();
  if (source && !["voice", "memory", "close"].includes(source) && !focus) {
    const focusSelector = terminalCompanionFocusSection === "preview"
      ? "[data-terminal-test-preset], [data-terminal-test-url]"
      : terminalCompanionFocusSection === "memory"
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

function scheduleTerminalCompanionFit() {
  document.querySelectorAll("[data-terminal-xterm]").forEach((node) => {
    const id = node.dataset.terminalXterm || "";
    if (id && typeof scheduleSettledPtyXtermFit === "function") {
      scheduleSettledPtyXtermFit(id, { forceBackend: true });
    }
  });
}
