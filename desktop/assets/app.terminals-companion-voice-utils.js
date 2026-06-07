function failTerminalVoiceRecorder(status) {
  terminalVoiceGeneration += 1;
  terminalVoiceStarting = false;
  terminalVoiceListening = false;
  terminalVoiceStatus = status;
  releaseTerminalVoiceRecorder(true);
  syncTerminalCompanion("voice");
}

function releaseTerminalVoiceRecorder(stopRecorder) {
  const recorder = terminalVoiceRecorder;
  if (recorder) {
    recorder.onerror = null;
    recorder.onstop = null;
    recorder.ondataavailable = null;
    if (stopRecorder && recorder.state !== "inactive") {
      try { recorder.stop(); } catch {}
    }
  }
  stopTerminalVoiceStream(terminalVoiceStream);
  terminalVoiceRecorder = null;
  terminalVoiceStream = null;
  terminalVoiceChunks = [];
}

function stopTerminalVoiceStream(stream) {
  stream?.getTracks?.().forEach((track) => {
    try { track.stop(); } catch {}
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
