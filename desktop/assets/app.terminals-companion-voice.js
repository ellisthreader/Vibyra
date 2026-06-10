function terminalVoiceHtml() {
  const available = terminalVoiceAvailable();
  const phase = terminalVoicePhase(available);
  const view = terminalVoicePhaseView(phase);
  const status = available ? terminalVoiceState.status : "Microphone unavailable";
  const statusDetail = terminalVoiceStatusDetail(status);
  const disabled = !available || terminalVoiceState.starting || terminalVoiceState.asking;
  return `<div class="terminal-voice-simple" data-voice-phase="${phase}">
    <section class="terminal-voice-stage">
      <button class="terminal-voice-talk" type="button" data-terminal-voice-toggle
        aria-label="${escapeAttribute(view.action)}"
        aria-pressed="${terminalVoiceState.listening}"
        ${disabled ? "disabled" : ""}>
        <span class="terminal-voice-phase-label"><i></i>${escapeHtml(view.badge)}</span>
        <span class="terminal-voice-visual" aria-hidden="true">
          <span class="terminal-voice-orbit"></span>
          <span class="terminal-voice-orb">
            <span class="terminal-voice-rings"></span>
            <span class="terminal-voice-bars">${terminalVoiceBars()}</span>
            <span class="terminal-voice-icon">${icon(view.icon)}</span>
          </span>
        </span>
        <span class="terminal-voice-copy">
          <strong>${escapeHtml(view.title)}</strong>
          <small>${escapeHtml(view.instruction)}</small>
        </span>
      </button>
      <p class="terminal-voice-status" role="status" aria-live="assertive" aria-atomic="true">
        <i aria-hidden="true"></i>
        <span><strong>${escapeHtml(view.status)}</strong>${statusDetail ? `<small>${escapeHtml(statusDetail)}</small>` : ""}</span>
      </p>
    </section>
    ${terminalVoiceConversationHtml()}
    <small class="terminal-voice-disclosure">${icon("sparkles")}AI-generated voice</small>
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
      instruction: "Click to begin or press Alt+V",
      status: "Vibyra isn't listening yet",
      title: "Talk to Vibyra"
    },
    listening: {
      action: "Stop listening and send",
      badge: "MIC LIVE",
      icon: "square",
      instruction: "Click when you are finished",
      status: "Vibyra can hear you now",
      title: "I'm listening"
    },
    notice: {
      action: "Try talking to Vibyra again",
      badge: "READY",
      icon: "pulse",
      instruction: "Click to try again or press Alt+V",
      status: "Vibyra isn't listening",
      title: "Talk to Vibyra"
    },
    processing: {
      action: "Vibyra is processing your message",
      badge: "WORKING",
      icon: "pulse",
      instruction: "Your message is being prepared",
      status: "Listening is paused",
      title: "Understanding you"
    },
    speaking: {
      action: "Interrupt Vibyra and start talking",
      badge: "VIBYRA LIVE",
      icon: "pulse",
      instruction: "Click to interrupt and speak",
      status: "Audio is playing",
      title: "Vibyra is speaking"
    },
    starting: {
      action: "Starting microphone",
      badge: "STARTING",
      icon: "pulse",
      instruction: "Connecting to your microphone",
      status: "Requesting microphone access",
      title: "Opening microphone"
    }
  };
  return views[phase] || views.idle;
}

function terminalVoiceStatusDetail(status) {
  const value = String(status || "").trim();
  const redundant = new Set([
    "Ready",
    "Listening",
    "Speaking",
    "Starting microphone",
    "Transcribing",
    "Vibyra is thinking",
    "Vibyra is responding"
  ]);
  return redundant.has(value) ? "" : value;
}

function terminalVoiceBars() {
  return Array.from({ length: 5 }, (_, index) => `<i style="--voice-bar:${index}"></i>`).join("");
}

function bindTerminalVoice(root = document) {
  root.querySelector("[data-terminal-voice-toggle]")?.addEventListener("click", toggleTerminalVoice);
  scrollTerminalVoiceConversation(root);
  bindTerminalVoiceHotkey();
}

function bindTerminalVoiceHotkey() {
  if (document.body.dataset.terminalVoiceHotkeyBound) return;
  document.body.dataset.terminalVoiceHotkeyBound = "1";
  document.addEventListener("keydown", (event) => {
    if (!event.altKey || event.shiftKey || event.code !== "KeyV" || event.repeat) return;
    if (terminalCompanionMode !== "chat") return;
    event.preventDefault();
    if (typeof terminalAiSurface !== "undefined" && terminalAiSurface !== "voice") {
      terminalAiSurface = "voice";
      syncTerminalCompanion("voice");
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
    const userMessage = appendTerminalVoiceMessage(terminal, "user", prompt);
    terminalVoiceSync();
    const reply = await replyRequest;
    if (!terminalVoiceGenerationCurrent(generation)) return;
    terminalVoiceState.asking = false;
    appendTerminalVoiceReply(userMessage, reply, terminal);
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
