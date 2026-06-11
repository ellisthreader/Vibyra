const terminalVoiceInputState = {
  chunks: [],
  generation: 0,
  hideTimer: null,
  phase: "idle",
  recorder: null,
  stream: null,
  targetId: "",
  timeout: null
};

function bindTerminalVoiceInput() {
  if (document.body.dataset.terminalVoiceInputBound) return;
  document.body.dataset.terminalVoiceInputBound = "1";
  document.addEventListener("keydown", handleTerminalVoiceInputHotkey, true);
  window.addEventListener("pagehide", () => cancelTerminalVoiceInput());
}

function handleTerminalVoiceInputHotkey(event) {
  if (event.code !== "F8" || event.repeat) return;
  event.preventDefault();
  event.stopPropagation();
  toggleTerminalVoiceInput();
}

function toggleTerminalVoiceInput() {
  if (terminalVoiceInputState.phase === "starting") {
    cancelTerminalVoiceInput();
    return;
  }
  if (terminalVoiceInputState.phase === "listening") {
    stopTerminalVoiceInput();
    return;
  }
  if (terminalVoiceInputState.phase === "transcribing") return;
  void startTerminalVoiceInput();
}

async function startTerminalVoiceInput() {
  const terminal = findTerminal(activeTerminalId);
  if (activePage !== "terminals" || !terminal) {
    showTerminalVoiceInput("error", "Select a terminal first", "Press F8");
    return;
  }
  if (!window.MediaRecorder || !navigator.mediaDevices?.getUserMedia) {
    showTerminalVoiceInput("error", "Microphone unavailable", "Check microphone access");
    return;
  }
  if (typeof stopTerminalVoiceForPanelClose === "function"
    && typeof terminalVoiceState !== "undefined"
    && (terminalVoiceState.starting || terminalVoiceState.listening || terminalVoiceState.asking || terminalVoiceState.speaking)) {
    stopTerminalVoiceForPanelClose();
  }
  cancelTerminalVoiceInput();
  terminalVoiceInputState.generation += 1;
  terminalVoiceInputState.targetId = terminal.id;
  const generation = terminalVoiceInputState.generation;
  showTerminalVoiceInput("starting", "Opening microphone", terminal.title);
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    if (generation !== terminalVoiceInputState.generation) {
      stopTerminalVoiceInputStream(stream);
      return;
    }
    terminalVoiceInputState.stream = stream;
    terminalVoiceInputState.chunks = [];
    terminalVoiceInputState.recorder = new MediaRecorder(stream);
    const recorder = terminalVoiceInputState.recorder;
    recorder.ondataavailable = (event) => {
      if (event.data?.size) terminalVoiceInputState.chunks.push(event.data);
    };
    recorder.onerror = () => failTerminalVoiceInput("Recording failed");
    recorder.onstop = () => void finishTerminalVoiceInput(generation, recorder.mimeType);
    recorder.start();
    terminalVoiceInputState.timeout = setTimeout(stopTerminalVoiceInput, 60_000);
    showTerminalVoiceInput("listening", "Listening", `${terminal.title} · F8 to send`);
  } catch {
    failTerminalVoiceInput("Microphone blocked");
  }
}

function stopTerminalVoiceInput() {
  clearTimeout(terminalVoiceInputState.timeout);
  terminalVoiceInputState.timeout = null;
  const recorder = terminalVoiceInputState.recorder;
  if (recorder?.state === "recording") {
    showTerminalVoiceInput("transcribing", "Transcribing", terminalVoiceInputTargetLabel());
    try {
      recorder.stop();
    } catch {
      failTerminalVoiceInput("Recording failed");
    }
  }
}

async function finishTerminalVoiceInput(generation, mimeType) {
  const blob = new Blob(terminalVoiceInputState.chunks, { type: mimeType || "audio/webm" });
  releaseTerminalVoiceInputRecorder();
  if (generation !== terminalVoiceInputState.generation) return;
  if (!blob.size) {
    failTerminalVoiceInput("No speech heard");
    return;
  }
  try {
    const response = await fetch("/desktop/voice/transcribe", {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({
        audioBase64: await terminalVoiceInputBlobBase64(blob),
        mimeType: blob.type,
        ...desktopPromptTranscriptMetadata("terminal-dictation", {
          terminal: desktopPromptTranscriptTarget(terminalVoiceInputState.targetId)
        })
      })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result.ok === false) {
      throw new Error(result.error || "Voice transcription failed.");
    }
    if (generation !== terminalVoiceInputState.generation) return;
    const terminal = deliverTerminalVoiceInput(
      result.text,
      terminalVoiceInputState.targetId,
      result.transcript
    );
    showTerminalVoiceInput("sent", "Sent to terminal", terminal.title);
  } catch (error) {
    failTerminalVoiceInput(error instanceof Error ? error.message : "Voice transcription failed");
  }
}

function deliverTerminalVoiceInput(text, targetId, transcriptTurn = null) {
  const prompt = String(text || "").trim();
  if (!prompt) throw new Error("No speech heard");
  const terminal = findTerminal(targetId);
  if (!terminal) throw new Error("The selected terminal was closed");
  if (!terminalCompanionInsertIntoTerminal(targetId, prompt, true, {
    logPrompt: false,
    transcriptSource: "terminal-dictation",
    transcriptTurn
  })) {
    throw new Error("Terminal input could not be delivered");
  }
  return terminal;
}

function cancelTerminalVoiceInput() {
  terminalVoiceInputState.generation += 1;
  clearTimeout(terminalVoiceInputState.timeout);
  terminalVoiceInputState.timeout = null;
  const recorder = terminalVoiceInputState.recorder;
  if (recorder && recorder.state !== "inactive") {
    recorder.onstop = null;
    try {
      recorder.stop();
    } catch {}
  }
  releaseTerminalVoiceInputRecorder();
  hideTerminalVoiceInput();
}

function failTerminalVoiceInput(message) {
  releaseTerminalVoiceInputRecorder();
  showTerminalVoiceInput("error", String(message || "Voice input failed"), "Press F8 to try again");
}

function releaseTerminalVoiceInputRecorder() {
  clearTimeout(terminalVoiceInputState.timeout);
  terminalVoiceInputState.timeout = null;
  const recorder = terminalVoiceInputState.recorder;
  if (recorder) {
    recorder.ondataavailable = null;
    recorder.onerror = null;
    recorder.onstop = null;
  }
  stopTerminalVoiceInputStream(terminalVoiceInputState.stream);
  terminalVoiceInputState.recorder = null;
  terminalVoiceInputState.stream = null;
  terminalVoiceInputState.chunks = [];
}

function stopTerminalVoiceInputStream(stream) {
  stream?.getTracks?.().forEach((track) => {
    try {
      track.stop();
    } catch {}
  });
}

function terminalVoiceInputTargetLabel() {
  return findTerminal(terminalVoiceInputState.targetId)?.title || "Selected terminal";
}

function showTerminalVoiceInput(phase, title, detail) {
  clearTimeout(terminalVoiceInputState.hideTimer);
  terminalVoiceInputState.phase = phase;
  const overlay = terminalVoiceInputOverlay();
  overlay.dataset.phase = phase;
  overlay.hidden = false;
  overlay.innerHTML = `<span class="terminal-voice-input-mark" aria-hidden="true"><i></i><i></i><i></i></span>
    <span class="terminal-voice-input-copy"><strong>${escapeHtml(title)}</strong><small>${escapeHtml(detail || "")}</small></span>
    ${["starting", "listening"].includes(phase) ? `<span class="terminal-voice-input-stop">Stop</span>` : ""}`;
  if (["sent", "error"].includes(phase)) {
    terminalVoiceInputState.hideTimer = setTimeout(hideTerminalVoiceInput, phase === "sent" ? 1800 : 4200);
  }
}

function hideTerminalVoiceInput() {
  clearTimeout(terminalVoiceInputState.hideTimer);
  terminalVoiceInputState.hideTimer = null;
  terminalVoiceInputState.phase = "idle";
  const overlay = document.querySelector("[data-terminal-voice-input]");
  if (overlay) overlay.hidden = true;
}

function terminalVoiceInputOverlay() {
  let overlay = document.querySelector("[data-terminal-voice-input]");
  if (overlay) return overlay;
  overlay = document.createElement("button");
  overlay.type = "button";
  overlay.className = "terminal-voice-input";
  overlay.dataset.terminalVoiceInput = "";
  overlay.setAttribute("aria-live", "assertive");
  overlay.setAttribute("aria-label", "Terminal voice input");
  overlay.hidden = true;
  overlay.addEventListener("click", () => {
    if (terminalVoiceInputState.phase === "starting") cancelTerminalVoiceInput();
    else if (terminalVoiceInputState.phase === "listening") stopTerminalVoiceInput();
  });
  document.body.append(overlay);
  return overlay;
}

function terminalVoiceInputBlobBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error || new Error("Voice recording could not be read."));
    reader.onload = () => resolve(String(reader.result || "").split(",").pop() || "");
    reader.readAsDataURL(blob);
  });
}

bindTerminalVoiceInput();
