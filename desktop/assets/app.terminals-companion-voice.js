let terminalVoiceListening = false;
let terminalVoiceStarting = false;
let terminalVoiceRecognition = null;
let terminalVoiceTargetId = "";
let terminalVoiceGeneration = 0;
let terminalVoiceRecorder = null;
let terminalVoiceStream = null;
let terminalVoiceChunks = [];
let terminalVoiceInterim = "";
let terminalVoiceTranscript = "";
let terminalVoiceStatus = "Ready";

function terminalVoiceHtml() {
  const active = terminalCompanionActiveTerminal();
  const available = terminalVoiceAvailable();
  const status = available ? terminalVoiceStatus : "Speech recognition unavailable";
  const toggleLabel = terminalVoiceStarting ? "Starting" : terminalVoiceListening ? "Stop" : "Mic";
  const stateClass = terminalVoiceListening ? " listening" : "";
  const copy = [terminalVoiceTranscript, terminalVoiceInterim].filter(Boolean).join(" ") || "Speak to type in the active terminal.";
  return "<div class=\"terminal-companion-head\"><span>Voice</span><div class=\"terminal-companion-head-actions\"><small role=\"status\" aria-live=\"polite\">" + escapeHtml(status) + "</small></div></div>"
    + "<div class=\"terminal-voice-orb" + stateClass + "\"><span>" + icon("pulse") + "</span><strong>" + escapeHtml(active?.title || "No terminal") + "</strong></div>"
    + "<div class=\"terminal-voice-actions\">"
    + "<button class=\"terminal-tool-button primary\" type=\"button\" data-terminal-voice-toggle aria-pressed=\"" + (terminalVoiceListening ? "true" : "false") + "\" " + (available && active && !terminalVoiceStarting ? "" : "disabled") + ">" + icon(terminalVoiceListening ? "square" : "pulse") + "<span>" + toggleLabel + "</span></button>"
    + "<button class=\"terminal-tool-button\" type=\"button\" data-terminal-voice-enter " + (active ? "" : "disabled") + ">" + icon("send") + "<span>Enter</span></button>"
    + "<button class=\"terminal-tool-button\" type=\"button\" data-terminal-voice-clear aria-label=\"Clear transcript\" title=\"Clear transcript\">" + icon("trash") + "</button>"
    + "</div><div class=\"terminal-voice-transcript\" aria-live=\"polite\">" + escapeHtml(copy) + "</div>";
}

function bindTerminalVoice(root = document) {
  root.querySelector("[data-terminal-voice-toggle]")?.addEventListener("click", () => {
    if (terminalVoiceListening) stopTerminalVoice();
    else void startTerminalVoice();
  });
  root.querySelector("[data-terminal-voice-enter]")?.addEventListener("click", terminalVoiceSendEnter);
  root.querySelector("[data-terminal-voice-clear]")?.addEventListener("click", () => {
    terminalVoiceTranscript = "";
    terminalVoiceInterim = "";
    syncTerminalCompanion("voice");
  });
}

async function startTerminalVoice() {
  if (terminalVoiceStarting || terminalVoiceListening) return;
  const Recognition = terminalVoiceApi();
  if (!Recognition && !terminalVoiceRecorderAvailable()) {
    terminalVoiceStatus = "Speech unavailable";
    syncTerminalCompanion("voice");
    return;
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    terminalVoiceStatus = "Microphone unavailable";
    syncTerminalCompanion("voice");
    return;
  }
  const target = terminalCompanionActiveTerminal();
  if (!target) return;
  terminalVoiceStarting = true;
  terminalVoiceTargetId = target.id;
  const generation = ++terminalVoiceGeneration;
  terminalVoiceStatus = "Starting";
  syncTerminalCompanion("voice");
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    if (generation !== terminalVoiceGeneration) {
      stopTerminalVoiceStream(stream);
      return;
    }
    if (!Recognition) {
      startTerminalVoiceRecorder(stream, generation);
      return;
    }
    stream?.getTracks?.().forEach((track) => track.stop());
  } catch {
    if (generation !== terminalVoiceGeneration) return;
    terminalVoiceStarting = false;
    terminalVoiceStatus = "Microphone blocked";
    syncTerminalCompanion("voice");
    return;
  }
  if (generation !== terminalVoiceGeneration) return;
  terminalVoiceRecognition?.abort?.();
  terminalVoiceRecognition = new Recognition();
  terminalVoiceRecognition.continuous = true;
  terminalVoiceRecognition.interimResults = true;
  terminalVoiceRecognition.lang = "en-US";
  terminalVoiceRecognition.onstart = () => { if (generation !== terminalVoiceGeneration) return; terminalVoiceStarting = false; terminalVoiceListening = true; terminalVoiceStatus = "Listening"; syncTerminalCompanion("voice"); };
  terminalVoiceRecognition.onerror = (event) => { if (generation !== terminalVoiceGeneration) return; terminalVoiceStarting = false; terminalVoiceStatus = terminalVoiceErrorStatus(event?.error); syncTerminalCompanion("voice"); };
  terminalVoiceRecognition.onend = () => { if (generation !== terminalVoiceGeneration) return; terminalVoiceStarting = false; terminalVoiceListening = false; terminalVoiceInterim = ""; if (terminalVoiceStatus === "Listening") terminalVoiceStatus = "Ready"; syncTerminalCompanion("voice"); };
  terminalVoiceRecognition.onresult = handleTerminalVoiceResult;
  try {
    terminalVoiceRecognition.start();
  } catch (error) {
    terminalVoiceStarting = false;
    terminalVoiceStatus = error instanceof Error ? error.message : "Voice could not start";
    syncTerminalCompanion("voice");
  }
}

function stopTerminalVoice() {
  terminalVoiceStarting = false;
  terminalVoiceListening = false;
  if (terminalVoiceRecorder?.state === "recording") {
    terminalVoiceStatus = "Transcribing";
    try {
      terminalVoiceRecorder.stop();
    } catch {
      failTerminalVoiceRecorder("Recording failed");
    }
    syncTerminalCompanion("voice");
    return;
  }
  terminalVoiceRecognition?.stop?.();
  terminalVoiceStatus = "Ready";
  syncTerminalCompanion("voice");
}

function stopTerminalVoiceForPanelClose() {
  terminalVoiceGeneration += 1;
  terminalVoiceStarting = false;
  terminalVoiceListening = false;
  terminalVoiceInterim = "";
  terminalVoiceRecognition?.abort?.();
  terminalVoiceRecognition = null;
  releaseTerminalVoiceRecorder(true);
  terminalVoiceTargetId = "";
  terminalVoiceStatus = "Ready";
}

function syncTerminalVoiceTarget(terminal) {
  const nextId = terminal?.id || "";
  if (nextId === terminalVoiceTargetId) return;
  if (terminalVoiceStarting || terminalVoiceListening || terminalVoiceRecorder) {
    stopTerminalVoiceForPanelClose();
  }
  terminalVoiceTargetId = nextId;
  terminalVoiceStatus = "Ready";
}

function handleTerminalVoiceResult(event) {
  let finalText = "";
  let interim = "";
  for (let index = event.resultIndex || 0; index < event.results.length; index += 1) {
    const result = event.results[index];
    const text = String(result?.[0]?.transcript || "").trim();
    if (!text) continue;
    if (result.isFinal) finalText += text + " ";
    else interim += text + " ";
  }
  terminalVoiceInterim = interim.trim();
  if (finalText.trim()) {
    terminalVoiceTranscript = (terminalVoiceTranscript + " " + finalText.trim()).trim().slice(-1200);
    terminalCompanionInsertIntoTerminal(terminalVoiceTargetId, finalText, false);
  }
  syncTerminalCompanion("voice");
}

function terminalVoiceSendEnter() {
  terminalCompanionInsertIntoTerminal(terminalVoiceTargetId || terminalCompanionActiveTerminal()?.id, "", true);
}

function terminalVoiceApi() {
  if (window.vibyraDesktopWindow?.isElectron) return null;
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

function terminalVoiceAvailable() {
  return Boolean(terminalVoiceApi() || terminalVoiceRecorderAvailable());
}

function terminalVoiceRecorderAvailable() {
  return Boolean(window.MediaRecorder && navigator.mediaDevices?.getUserMedia);
}

function startTerminalVoiceRecorder(stream, generation) {
  terminalVoiceStream = stream;
  terminalVoiceChunks = [];
  try {
    terminalVoiceRecorder = new MediaRecorder(stream);
  } catch {
    failTerminalVoiceRecorder("Recording unavailable");
    return;
  }
  terminalVoiceRecorder.ondataavailable = (event) => {
    if (event.data?.size) terminalVoiceChunks.push(event.data);
  };
  terminalVoiceRecorder.onerror = () => {
    if (generation !== terminalVoiceGeneration) return;
    failTerminalVoiceRecorder("Recording failed");
  };
  terminalVoiceRecorder.onstop = () => void finishTerminalVoiceRecording(generation);
  try {
    terminalVoiceRecorder.start();
  } catch {
    failTerminalVoiceRecorder("Recording could not start");
    return;
  }
  terminalVoiceStarting = false;
  terminalVoiceListening = true;
  terminalVoiceStatus = "Listening";
  syncTerminalCompanion("voice");
}

async function finishTerminalVoiceRecording(generation) {
  const targetId = terminalVoiceTargetId;
  const blob = new Blob(terminalVoiceChunks, { type: terminalVoiceRecorder?.mimeType || "audio/webm" });
  releaseTerminalVoiceRecorder(false);
  if (generation !== terminalVoiceGeneration) return;
  if (!blob.size) {
    terminalVoiceStatus = "No speech heard";
    syncTerminalCompanion("voice");
    return;
  }
  try {
    const response = await fetch("/desktop/voice/transcribe", {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ audioBase64: await blobToBase64(blob), mimeType: blob.type })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result.ok === false) throw new Error(result.error || "Voice transcription failed.");
    const text = String(result.text || "").trim();
    if (text) {
      terminalVoiceTranscript = (terminalVoiceTranscript + " " + text).trim().slice(-1200);
      terminalCompanionInsertIntoTerminal(targetId, text, false);
    }
    terminalVoiceStatus = text ? "Ready" : "No speech heard";
  } catch (error) {
    terminalVoiceStatus = error instanceof Error ? error.message : "Voice transcription failed";
  } finally {
    if (generation === terminalVoiceGeneration) syncTerminalCompanion("voice");
  }
}

window.addEventListener("pagehide", stopTerminalVoiceForPanelClose);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") stopTerminalVoiceForPanelClose();
});
