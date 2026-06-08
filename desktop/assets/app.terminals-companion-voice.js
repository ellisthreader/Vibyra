function terminalVoiceHtml() {
  const available = terminalVoiceAvailable();
  const phase = terminalVoicePhase(available);
  const view = terminalVoicePhaseView(phase);
  const status = available ? terminalVoiceState.status : "Microphone unavailable";
  const disabled = !available || terminalVoiceState.starting || terminalVoiceState.asking;
  return `<div class="terminal-voice-simple" data-voice-phase="${phase}">
    <button class="terminal-voice-back" type="button" data-terminal-companion-open="chat">${icon("arrow")}<span>Back to chat</span></button>
    <button class="terminal-voice-talk" type="button" data-terminal-voice-toggle
      aria-label="${escapeAttribute(view.action)}"
      aria-pressed="${terminalVoiceState.listening}"
      ${disabled ? "disabled" : ""}>
      <span class="terminal-voice-phase-label"><i></i>${escapeHtml(view.badge)}</span>
      <span class="terminal-voice-orb" aria-hidden="true">
        <span class="terminal-voice-rings"></span>
        <span class="terminal-voice-bars">${terminalVoiceBars()}</span>
        <span class="terminal-voice-icon">${icon(view.icon)}</span>
      </span>
      <strong>${escapeHtml(view.title)}</strong>
      <small>${escapeHtml(view.instruction)}</small>
    </button>
    <p class="terminal-voice-status" role="status" aria-live="assertive" aria-atomic="true">
      <strong>${escapeHtml(view.status)}</strong>
      <span>${escapeHtml(status)}</span>
    </p>
    ${terminalVoiceConversationHtml()}
    <small class="terminal-voice-disclosure">AI-generated voice</small>
  </div>`;
}

function terminalVoicePhase(available) {
  if (!available) return "error";
  if (terminalVoiceState.speaking) return "speaking";
  if (terminalVoiceState.listening) return "listening";
  if (terminalVoiceState.starting) return "starting";
  if (terminalVoiceState.asking || ["Transcribing", "Vibyra is responding"].includes(terminalVoiceState.status)) {
    return "processing";
  }
  if (terminalVoiceState.status !== "Ready") return "notice";
  return "idle";
}

function terminalVoicePhaseView(phase) {
  const views = {
    error: {
      action: "Microphone unavailable",
      badge: "MIC OFF",
      icon: "pulse",
      instruction: "Check microphone access to continue",
      status: "Voice needs attention",
      title: "Microphone unavailable"
    },
    idle: {
      action: "Start talking to Vibyra",
      badge: "READY",
      icon: "pulse",
      instruction: "Click or press Alt+V to start",
      status: "Vibyra isn't listening yet",
      title: "Talk to Vibyra"
    },
    listening: {
      action: "Stop listening and send",
      badge: "MIC LIVE",
      icon: "square",
      instruction: "Click or press Alt+V when finished",
      status: "Vibyra can hear you now",
      title: "I'm listening"
    },
    notice: {
      action: "Try talking to Vibyra again",
      badge: "READY",
      icon: "pulse",
      instruction: "Click or press Alt+V to try again",
      status: "Vibyra isn't listening",
      title: "Talk to Vibyra"
    },
    processing: {
      action: "Vibyra is processing your message",
      badge: "WORKING",
      icon: "pulse",
      instruction: "Listening is paused while I respond",
      status: "Please wait",
      title: "Understanding you"
    },
    speaking: {
      action: "Interrupt Vibyra and start talking",
      badge: "VIBYRA LIVE",
      icon: "pulse",
      instruction: "Click or press Alt+V to interrupt",
      status: "Audio is playing",
      title: "Vibyra is speaking"
    },
    starting: {
      action: "Starting microphone",
      badge: "STARTING",
      icon: "pulse",
      instruction: "Your microphone will light up when live",
      status: "Please wait",
      title: "Opening microphone"
    }
  };
  return views[phase] || views.idle;
}

function terminalVoiceBars() {
  return Array.from({ length: 5 }, (_, index) => `<i style="--voice-bar:${index}"></i>`).join("");
}

function bindTerminalVoice(root = document) {
  root.querySelector("[data-terminal-voice-toggle]")?.addEventListener("click", toggleTerminalVoice);
  root.querySelector(".terminal-voice-back")?.addEventListener("click", stopTerminalVoiceForPanelClose);
  scrollTerminalVoiceConversation(root);
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
  if (terminalVoiceTargetId(terminal) !== terminalVoiceState.targetId) return;
  terminalVoiceState.asking = true;
  terminalVoiceSetStatus("Vibyra is thinking");
  try {
    const replyRequest = requestTerminalVoiceReply(prompt, terminal, generation);
    appendTerminalVoiceMessage(terminal, "user", prompt);
    terminalVoiceSync();
    const reply = await replyRequest;
    if (!terminalVoiceGenerationCurrent(generation)) return;
    terminalVoiceState.asking = false;
    appendTerminalVoiceMessage(terminalCompanionActiveTerminal() || terminal, "assistant", reply);
    terminalVoiceSync();
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
  const nextId = terminalVoiceTargetId(terminal);
  if (nextId === terminalVoiceState.targetId) return;
  if (terminalVoiceState.actionInFlight) {
    transferTerminalVoiceThread(terminalVoiceState.targetId, nextId);
    terminalVoiceState.targetId = nextId;
    return;
  }
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
