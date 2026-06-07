let terminalCompanionMode = "";
let terminalPhonePreviewStatus = "";
let terminalPhonePreviewOpening = false;
let terminalCompanionReturnFocusId = "";
const terminalCompanionModes = new Set(["phone", "voice", "memory"]);
const terminalCompanionCommands = {
  "/phone": "phone",
  "/voice": "voice",
  "/memory": "memory",
  "/memories": "memory"
};
const terminalPhonePtyBuffers = {};

function openTerminalCompanionPanel(mode = "", source = "terminal") {
  terminalCompanionReturnFocusId = terminalCompanionActiveTerminal()?.id || activeTerminalId || "";
  terminalCompanionMode = terminalCompanionModes.has(mode) ? mode : "";
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
  syncTerminalCompanion("close");
  if (terminalCompanionReturnFocusId && typeof focusPtyTerminal === "function") {
    requestAnimationFrame(() => focusPtyTerminal(terminalCompanionReturnFocusId));
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
  const project = currentProject();
  const preview = currentState.latestPreview || {};
  const previewUrl = preview.url || "";
  const launchDisabled = terminalPhonePreviewOpening ? "disabled" : "";
  const voiceHtml = typeof terminalVoiceHtml === "function" ? terminalVoiceHtml() : "";
  const memoryHtml = typeof terminalMemoryHtml === "function" ? terminalMemoryHtml() : "";
  return `<aside class="terminal-companion" data-terminal-companion aria-label="Terminal side panel">
    <section class="terminal-companion-section terminal-voice-section ${terminalCompanionMode === "voice" ? "active" : ""}" data-terminal-voice-panel>
      ${voiceHtml}
    </section>
    <section class="terminal-companion-section terminal-memory-section ${terminalCompanionMode === "memory" ? "active" : ""}" data-terminal-memory-panel>
      ${memoryHtml}
    </section>
    <section class="terminal-companion-section terminal-phone-section ${terminalCompanionMode === "phone" ? "active" : ""}" data-terminal-phone-panel>
      <div class="terminal-companion-head"><span>Phone Preview</span><button type="button" data-terminal-phone-close aria-label="Close phone preview">${icon("close")}</button></div>
      <div class="terminal-phone-host" data-phone-preview-host>
        <div class="terminal-phone-shell" aria-hidden="true"><span></span><i></i></div>
        <div class="terminal-phone-copy">
          <strong>${escapeHtml(project?.name || "No project selected")}</strong>
          <small>${previewUrl ? escapeHtml(previewUrl) : "Ready for the existing PhonePreview helper."}</small>
        </div>
        <button class="terminal-phone-launch" type="button" data-terminal-phone-launch ${launchDisabled}>${icon("play")}<span>${terminalPhonePreviewOpening ? "Opening..." : "Open PhonePreview"}</span></button>
        ${terminalPhonePreviewStatus ? `<p class="terminal-phone-status">${escapeHtml(terminalPhonePreviewStatus)}</p>` : ""}
      </div>
    </section>
  </aside>`;
}

function syncTerminalCompanion(source = "") {
  if (activePage !== "terminals" || !nodes?.content) return false;
  const page = nodes.content.querySelector(".terminal-page") || nodes.content.querySelector(".terminal-setup");
  if (!page) return false;
  const setupMode = page.classList.contains("terminal-setup");
  const existing = page.querySelector("[data-terminal-companion]");
  if (!terminalCompanionModes.has(terminalCompanionMode)) {
    page.classList.remove("terminal-page--with-companion", "terminal-setup--with-companion", "terminal-page--phone-open", "terminal-setup--phone-open");
    existing?.remove();
    scheduleTerminalCompanionFit();
    return true;
  }
  page.classList.remove(setupMode ? "terminal-page--with-companion" : "terminal-setup--with-companion");
  page.classList.add(setupMode ? "terminal-setup--with-companion" : "terminal-page--with-companion");
  page.classList.toggle("terminal-page--phone-open", !setupMode && terminalCompanionMode === "phone");
  page.classList.toggle("terminal-setup--phone-open", setupMode && terminalCompanionMode === "phone");
  if (existing && !source) {
    bindTerminalCompanion();
    return true;
  }
  const focus = captureTerminalCompanionFocus(existing);
  if (existing) existing.outerHTML = terminalCompanionHtml();
  else page.insertAdjacentHTML("beforeend", terminalCompanionHtml(source));
  bindTerminalCompanion();
  restoreTerminalCompanionFocus(focus);
  scheduleTerminalCompanionFit();
  if (source && !["voice", "memory", "close"].includes(source) && !focus) {
    requestAnimationFrame(() => page.querySelector("[data-terminal-companion] button, [data-terminal-companion] textarea")?.focus?.());
  }
  return true;
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

function bindTerminalCompanion() {
  document.querySelectorAll("[data-terminal-companion-close]").forEach((button) => {
    if (button.dataset.companionCloseBound) return;
    button.dataset.companionCloseBound = "1";
    button.addEventListener("click", closeTerminalCompanionPanel);
  });
  document.querySelectorAll("[data-terminal-phone-close]").forEach((button) => {
    if (button.dataset.phoneCloseBound) return;
    button.dataset.phoneCloseBound = "1";
    button.addEventListener("click", closeTerminalPhonePanel);
  });
  document.querySelectorAll("[data-terminal-phone-launch]").forEach((button) => {
    if (button.dataset.phoneLaunchBound) return;
    button.dataset.phoneLaunchBound = "1";
    button.addEventListener("click", launchTerminalPhonePreview);
  });
  if (typeof bindTerminalVoice === "function") bindTerminalVoice();
  if (typeof bindTerminalMemory === "function") bindTerminalMemory();
  if (!document.body.dataset.terminalCompanionEscapeBound) {
    document.body.dataset.terminalCompanionEscapeBound = "1";
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && terminalCompanionMode) closeTerminalCompanionPanel();
    });
  }
}

function captureTerminalCompanionFocus(root) {
  const field = root?.contains(document.activeElement) ? document.activeElement : null;
  if (!field) return null;
  const key = ["terminalVoiceToggle", "terminalMemorySearch", "terminalMemoryTitle", "terminalMemoryBody"]
    .find((name) => field.dataset?.[name] !== undefined);
  return key ? { key, start: field.selectionStart, end: field.selectionEnd } : null;
}

function restoreTerminalCompanionFocus(focus) {
  if (!focus) return;
  const field = document.querySelector(`[data-${focus.key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}]`);
  field?.focus?.();
  if (typeof field?.setSelectionRange === "function" && Number.isInteger(focus.start)) {
    field.setSelectionRange(focus.start, focus.end);
  }
}

async function launchTerminalPhonePreview() {
  if (terminalPhonePreviewOpening) return;
  terminalPhonePreviewOpening = true;
  terminalPhonePreviewStatus = "";
  syncTerminalCompanion();
  const preview = currentState.latestPreview || {};
  const url = normalizeTerminalPhonePreviewUrl(preview.url || "");
  try {
    const response = await fetch("/desktop/phone-preview/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result.ok === false) throw new Error(result.error || "PhonePreview could not start.");
    terminalPhonePreviewStatus = "Opened existing PhonePreview.";
  } catch (error) {
    terminalPhonePreviewStatus = error instanceof Error ? error.message : "PhonePreview could not start.";
  } finally {
    terminalPhonePreviewOpening = false;
    syncTerminalCompanion();
  }
}

function normalizeTerminalPhonePreviewUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return "http://localhost:8081";
  try {
    return new URL(raw, window.location.origin).toString();
  } catch {
    return "http://localhost:8081";
  }
}

const previousRenderTerminalsPageForCompanion = renderTerminalsPage;
renderTerminalsPage = function renderTerminalsPageWithCompanion() {
  previousRenderTerminalsPageForCompanion();
  syncTerminalCompanion();
};

const previousSetPageForCompanion = setPage;
setPage = function setPageWithCompanion(page) {
  if (page !== "terminals" && terminalCompanionMode) closeTerminalCompanionPanel();
  previousSetPageForCompanion(page);
};

if (typeof sendPtyInput === "function") {
  const previousSendPtyInputForPhone = sendPtyInput;
  sendPtyInput = function sendPtyInputWithPhone(id, input) {
    if (interceptPtyPhoneInput(id, input, previousSendPtyInputForPhone)) return;
    previousSendPtyInputForPhone(id, input);
  };
}

function interceptPtyPhoneInput(id, input, sendInput) {
  if (!id) return false;
  const value = String(input || "");
  const buffered = terminalPhonePtyBuffers[id] || "";
  if (value === "\r" || value === "\n") {
    const mode = terminalCompanionCommands[buffered];
    if (mode) {
      delete terminalPhonePtyBuffers[id];
      sendInput(id, "\x15");
      openTerminalCompanionPanel(mode, "pty");
      return true;
    }
    delete terminalPhonePtyBuffers[id];
    return false;
  }
  if (value === "\x7f" || value === "\b") {
    if (buffered) terminalPhonePtyBuffers[id] = buffered.slice(0, -1);
    return false;
  }
  if (value === "\x1b" || value === "\x03" || value === "\x04") {
    delete terminalPhonePtyBuffers[id];
    return false;
  }
  if (!/^[\x20-\x7e]+$/.test(value)) return false;
  const next = buffered || value.startsWith("/") ? buffered + value : "";
  if (next && Object.keys(terminalCompanionCommands).some((command) => command.startsWith(next))) terminalPhonePtyBuffers[id] = next;
  else delete terminalPhonePtyBuffers[id];
  return false;
}
