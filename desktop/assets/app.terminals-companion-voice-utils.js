const terminalVoiceState = {
  actionInFlight: false,
  asking: false,
  captureText: "",
  generation: 0,
  listening: false,
  recognition: null,
  recorder: null,
  recorderChunks: [],
  speaking: false,
  starting: false,
  status: "Ready",
  stream: null,
  targetId: ""
};

function terminalVoiceTargetId(terminal = terminalCompanionActiveTerminal()) {
  return terminal?.id || "setup";
}

function terminalVoiceSync() {
  if (terminalCompanionMode === "voice") syncTerminalCompanion("voice");
}

function terminalVoiceSetStatus(status, sync = true) {
  terminalVoiceState.status = status;
  if (sync) terminalVoiceSync();
}

function terminalVoiceInvalidate() {
  terminalVoiceState.generation += 1;
  terminalVoiceState.asking = false;
  terminalVoiceState.starting = false;
  terminalVoiceState.listening = false;
  terminalVoiceState.captureText = "";
}

function terminalVoiceGenerationCurrent(generation) {
  return generation === terminalVoiceState.generation;
}

function stopTerminalVoiceStream(stream) {
  stream?.getTracks?.().forEach((track) => {
    try {
      track.stop();
    } catch {}
  });
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error || new Error("Voice recording could not be read."));
    reader.onload = () => resolve(String(reader.result || "").split(",").pop() || "");
    reader.readAsDataURL(blob);
  });
}

function terminalVoiceErrorStatus(error) {
  if (error === "not-allowed" || error === "service-not-allowed") return "Microphone blocked";
  if (error === "network") return "Speech service unavailable";
  if (error === "audio-capture") return "Microphone unavailable";
  if (error === "no-speech") return "No speech heard";
  return error ? `Voice error: ${error}` : "Voice paused";
}

function terminalVoiceErrorMessage(error, fallback) {
  return error instanceof Error && error.message ? error.message : fallback;
}
