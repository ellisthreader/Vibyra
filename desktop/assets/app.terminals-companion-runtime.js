function bindTerminalCompanion() {
  bindTerminalCompanionLaunchers(document.querySelector("[data-terminal-companion]") || document);
  document.querySelectorAll("[data-terminal-companion-close]").forEach((button) => {
    if (button.dataset.companionCloseBound) return;
    button.dataset.companionCloseBound = "1";
    button.addEventListener("click", closeTerminalCompanionPanel);
  });
  document.querySelectorAll("[data-terminal-phone-launch]").forEach((button) => {
    if (button.dataset.phoneLaunchBound) return;
    button.dataset.phoneLaunchBound = "1";
    button.addEventListener("click", launchTerminalPhonePreview);
  });
  const companion = document.querySelector("[data-terminal-companion]");
  if (typeof bindTerminalCompanionLayout === "function") bindTerminalCompanionLayout(companion);
  if (typeof bindTerminalVoiceHotkey === "function") bindTerminalVoiceHotkey();
  if (terminalCompanionMode === "editor" && typeof bindTerminalEditor === "function") bindTerminalEditor(companion);
  if (terminalCompanionMode === "chat" && typeof bindTerminalAiChat === "function") bindTerminalAiChat(companion);
  if (terminalCompanionMode === "preview" && typeof syncTerminalTestWorkspace === "function") {
    syncTerminalTestWorkspace();
  }
  if (companion?.querySelector("[data-terminal-memory-workspace]") && typeof bindTerminalMemory === "function") {
    bindTerminalMemory(companion);
  }
  if (!document.body.dataset.terminalCompanionEscapeBound) {
    document.body.dataset.terminalCompanionEscapeBound = "1";
    document.addEventListener("keydown", (event) => {
      if (event.key !== "Escape" || !terminalCompanionMode) return;
      if (typeof terminalMemoryIsFullscreen === "function" && terminalMemoryIsFullscreen()) {
        setTerminalMemoryFullscreen(false);
        return;
      }
      closeTerminalCompanionPanel();
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
  const selector = focus.key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
  const field = document.querySelector(`[data-${selector}]`);
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

const previousSetActiveTerminalForCompanion = setActiveTerminal;
setActiveTerminal = function setActiveTerminalWithCompanion(id) {
  switchTerminalCompanionContext(id, previousSetActiveTerminalForCompanion);
};

if (typeof focusPtyTerminal === "function") {
  const previousFocusPtyTerminalForCompanion = focusPtyTerminal;
  focusPtyTerminal = function focusPtyTerminalWithCompanion(id) {
    if (!id || id === activeTerminalId) {
      previousFocusPtyTerminalForCompanion(id);
      return;
    }
    switchTerminalCompanionContext(id, previousFocusPtyTerminalForCompanion);
  };
}

function switchTerminalCompanionContext(id, activate) {
  const finish = () => {
    activate(id);
    if (terminalCompanionMode) syncTerminalCompanion("terminal-change");
  };
  const memoryBusy = Boolean(document.querySelector("[data-terminal-memory-workspace]"))
    && typeof terminalMemoryState !== "undefined"
    && (terminalMemoryState.dirty || terminalMemoryState.saving);
  if (!memoryBusy || typeof flushTerminalMemorySave !== "function") {
    finish();
    return;
  }
  const generation = ++terminalCompanionSwitchGeneration;
  void flushTerminalMemorySave().finally(async () => {
    for (let attempt = 0; terminalMemoryState.saving && attempt < 250; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    if (generation === terminalCompanionSwitchGeneration) finish();
  });
}

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
    delete terminalPhonePtyBuffers[id];
    if (!mode) return false;
    sendInput(id, "\x15");
    if (mode === "voice" && typeof openTerminalAiVoice === "function") openTerminalAiVoice("pty");
    else openTerminalCompanionPanel(mode, "pty");
    return true;
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
  if (next && Object.keys(terminalCompanionCommands).some((command) => command.startsWith(next))) {
    terminalPhonePtyBuffers[id] = next;
  } else {
    delete terminalPhonePtyBuffers[id];
  }
  return false;
}
