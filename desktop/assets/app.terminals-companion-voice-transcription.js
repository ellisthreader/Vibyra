async function finishTerminalVoiceRecording(generation) {
  const recorder = terminalVoiceState.recorder;
  const blob = new Blob(terminalVoiceState.recorderChunks, {
    type: recorder?.mimeType || "audio/webm"
  });
  releaseTerminalVoiceRecorder(false);
  if (!terminalVoiceGenerationCurrent(generation)) return;
  if (!blob.size) {
    terminalVoiceSetStatus("No speech heard");
    return;
  }
  try {
    const response = await fetch("/desktop/voice/transcribe", {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ audioBase64: await blobToBase64(blob), mimeType: blob.type })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result.ok === false) {
      throw new Error(result.error || "Voice transcription failed.");
    }
    if (!terminalVoiceGenerationCurrent(generation)) return;
    const text = String(result.text || "").trim();
    if (text) await submitTerminalVoicePrompt(text, generation);
    else terminalVoiceSetStatus("No speech heard");
  } catch (error) {
    if (terminalVoiceGenerationCurrent(generation)) {
      terminalVoiceSetStatus(terminalVoiceErrorMessage(error, "Voice transcription failed"));
    }
  }
}

function failTerminalVoiceRecorder(status) {
  terminalVoiceInvalidate();
  releaseTerminalVoiceRecorder(true);
  terminalVoiceSetStatus(status);
}

function releaseTerminalVoiceRecorder(stopRecorder) {
  const recorder = terminalVoiceState.recorder;
  if (recorder) {
    recorder.onerror = null;
    recorder.onstop = null;
    recorder.ondataavailable = null;
    if (stopRecorder && recorder.state !== "inactive") {
      try {
        recorder.stop();
      } catch {}
    }
  }
  stopTerminalVoiceStream(terminalVoiceState.stream);
  terminalVoiceState.recorder = null;
  terminalVoiceState.stream = null;
  terminalVoiceState.recorderChunks = [];
}
