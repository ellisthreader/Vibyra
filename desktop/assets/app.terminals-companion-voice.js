function terminalVoiceHtml() {
  const available = terminalVoiceAvailable();
  const busy = terminalVoiceState.starting || terminalVoiceState.asking;
  const stateClass = terminalVoiceState.listening
    ? " listening"
    : busy
      ? " busy"
      : terminalVoiceState.speaking
        ? " speaking"
        : "";
  const label = terminalVoiceState.starting
    ? "Starting..."
    : terminalVoiceState.listening
      ? "Stop and send"
      : terminalVoiceState.asking
        ? "Vibyra is thinking..."
        : terminalVoiceState.speaking
          ? "Vibyra is speaking"
          : "Talk to Vibyra";
  const status = available ? terminalVoiceState.status : "Microphone unavailable";
  return `<div class="terminal-voice-simple${stateClass}">
    <button class="terminal-voice-back" type="button" data-terminal-companion-open="chat">${icon("arrow")}<span>Back to chat</span></button>
    <button class="terminal-voice-talk" type="button" data-terminal-voice-toggle aria-pressed="${terminalVoiceState.listening}" ${available && !terminalVoiceState.asking ? "" : "disabled"}>
      <span>${icon(terminalVoiceState.listening ? "square" : "pulse")}</span>
      <strong>${escapeHtml(label)}</strong>
      <small>${terminalVoiceState.listening ? "Click or press Alt+V when you finish" : "Click or press Alt+V to talk"}</small>
    </button>
    <p class="terminal-voice-status" role="status" aria-live="polite">${escapeHtml(status)}</p>
    <small class="terminal-voice-disclosure">AI-generated voice</small>
  </div>`;
}

function bindTerminalVoice(root = document) {
  root.querySelector("[data-terminal-voice-toggle]")?.addEventListener("click", toggleTerminalVoice);
  root.querySelector(".terminal-voice-back")?.addEventListener("click", stopTerminalVoiceForPanelClose);
  bindTerminalVoiceHotkey();
}

function bindTerminalVoiceHotkey() {
  if (document.body.dataset.terminalVoiceHotkeyBound) return;
  document.body.dataset.terminalVoiceHotkeyBound = "1";
  document.addEventListener("keydown", (event) => {
    if (!event.altKey || event.code !== "KeyV" || event.repeat) return;
    if (!["chat", "voice"].includes(terminalCompanionMode)) return;
    event.preventDefault();
    if (terminalCompanionMode === "chat") {
      openTerminalCompanionPanel("voice", "voice");
      requestAnimationFrame(() => toggleTerminalVoice());
      return;
    }
    toggleTerminalVoice();
  });
}

function toggleTerminalVoice() {
  if (terminalVoiceState.asking) return;
  if (terminalVoiceState.listening) stopTerminalVoiceCapture();
  else void startTerminalVoiceCapture();
}

async function submitTerminalVoicePrompt(text, generation = terminalVoiceState.generation) {
  const prompt = String(text || "").trim();
  if (!prompt || terminalVoiceState.asking || !terminalVoiceGenerationCurrent(generation)) return;
  const terminal = terminalCompanionActiveTerminal();
  if (!terminal || terminal.id !== terminalVoiceState.targetId) return;
  terminalVoiceState.asking = true;
  terminalVoiceSetStatus("Vibyra is thinking");
  try {
    const reply = await requestTerminalVoiceReply(prompt, terminal, generation);
    if (!terminalVoiceGenerationCurrent(generation)) return;
    terminalVoiceState.asking = false;
    await playTerminalVoiceReply(reply, generation);
  } catch (error) {
    if (!terminalVoiceGenerationCurrent(generation)) return;
    terminalVoiceState.asking = false;
    terminalVoiceSetStatus(terminalVoiceErrorMessage(error, "Vibyra AI could not reply"));
  } finally {
    if (terminalVoiceGenerationCurrent(generation)) {
      terminalVoiceState.asking = false;
      terminalVoiceSync();
    }
  }
}

function stopTerminalVoiceForPanelClose() {
  terminalVoiceInvalidate();
  stopTerminalVoiceCapture(true);
  stopTerminalVoicePlayback();
  terminalVoiceState.targetId = "";
  terminalVoiceSetStatus("Ready", false);
}

function syncTerminalVoiceTarget(terminal) {
  const nextId = terminal?.id || "";
  if (nextId === terminalVoiceState.targetId) return;
  terminalVoiceInvalidate();
  stopTerminalVoiceCapture(true);
  stopTerminalVoicePlayback();
  terminalVoiceState.targetId = nextId;
  terminalVoiceSetStatus("Ready", false);
}

window.addEventListener("pagehide", stopTerminalVoiceForPanelClose);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") stopTerminalVoiceForPanelClose();
});
