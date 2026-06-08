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

async function startTerminalVoiceCapture() {
  if (terminalVoiceState.starting || terminalVoiceState.listening || terminalVoiceState.asking) return;
  const Recognition = terminalVoiceApi();
  if ((!Recognition && !terminalVoiceRecorderAvailable()) || !navigator.mediaDevices?.getUserMedia) {
    terminalVoiceSetStatus("Microphone unavailable");
    return;
  }
  const target = terminalCompanionActiveTerminal();
  terminalVoiceInvalidate();
  stopTerminalVoicePlayback();
  terminalVoiceState.starting = true;
  terminalVoiceState.targetId = terminalVoiceTargetId(target);
  const generation = terminalVoiceState.generation;
  terminalVoiceSetStatus("Starting microphone");
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    if (!terminalVoiceGenerationCurrent(generation)) {
      stopTerminalVoiceStream(stream);
      return;
    }
    if (!Recognition) {
      startTerminalVoiceRecorder(stream, generation);
      return;
    }
    stopTerminalVoiceStream(stream);
    startTerminalVoiceRecognition(Recognition, generation);
  } catch {
    if (!terminalVoiceGenerationCurrent(generation)) return;
    terminalVoiceState.starting = false;
    terminalVoiceSetStatus("Microphone blocked");
  }
}

function startTerminalVoiceRecognition(Recognition, generation) {
  const recognition = new Recognition();
  terminalVoiceState.recognition = recognition;
  recognition.continuous = false;
  recognition.interimResults = true;
  recognition.lang = "en-US";
  recognition.onstart = () => terminalVoiceCaptureStarted(generation);
  recognition.onerror = (event) => {
    if (!terminalVoiceGenerationCurrent(generation)) return;
    terminalVoiceInvalidate();
    terminalVoiceState.recognition = null;
    terminalVoiceSetStatus(terminalVoiceErrorStatus(event?.error));
  };
  recognition.onend = () => finishTerminalVoiceRecognition(generation);
  recognition.onresult = handleTerminalVoiceResult;
  try {
    recognition.start();
  } catch (error) {
    terminalVoiceState.starting = false;
    terminalVoiceSetStatus(terminalVoiceErrorMessage(error, "Voice could not start"));
  }
}

function handleTerminalVoiceResult(event) {
  let finalText = "";
  let interimText = "";
  for (let index = event.resultIndex || 0; index < event.results.length; index += 1) {
    const result = event.results[index];
    const text = String(result?.[0]?.transcript || "").trim();
    if (!text) continue;
    if (result.isFinal) finalText += `${text} `;
    else interimText += `${text} `;
  }
  terminalVoiceState.captureText = (finalText || interimText).trim();
  if (finalText) terminalVoiceSetStatus("Transcribing");
}

function finishTerminalVoiceRecognition(generation) {
  if (!terminalVoiceGenerationCurrent(generation)) return;
  const text = terminalVoiceState.captureText;
  terminalVoiceState.recognition = null;
  terminalVoiceState.starting = false;
  terminalVoiceState.listening = false;
  terminalVoiceState.captureText = "";
  if (text) void submitTerminalVoicePrompt(text, generation);
  else terminalVoiceSetStatus("No speech heard");
}

function startTerminalVoiceRecorder(stream, generation) {
  terminalVoiceState.stream = stream;
  terminalVoiceState.recorderChunks = [];
  try {
    terminalVoiceState.recorder = new MediaRecorder(stream);
  } catch {
    failTerminalVoiceRecorder("Recording unavailable");
    return;
  }
  const recorder = terminalVoiceState.recorder;
  recorder.ondataavailable = (event) => {
    if (event.data?.size) terminalVoiceState.recorderChunks.push(event.data);
  };
  recorder.onerror = () => {
    if (terminalVoiceGenerationCurrent(generation)) failTerminalVoiceRecorder("Recording failed");
  };
  recorder.onstop = () => void finishTerminalVoiceRecording(generation);
  try {
    recorder.start();
    terminalVoiceCaptureStarted(generation);
  } catch {
    failTerminalVoiceRecorder("Recording could not start");
  }
}

function terminalVoiceCaptureStarted(generation) {
  if (!terminalVoiceGenerationCurrent(generation)) return;
  terminalVoiceState.starting = false;
  terminalVoiceState.listening = true;
  terminalVoiceSetStatus("Listening");
}

function stopTerminalVoiceCapture(cancel = false) {
  terminalVoiceState.starting = false;
  terminalVoiceState.listening = false;
  if (terminalVoiceState.recorder?.state === "recording") {
    terminalVoiceSetStatus(cancel ? "Ready" : "Transcribing");
    if (cancel) releaseTerminalVoiceRecorder(true);
    else {
      try {
        terminalVoiceState.recorder.stop();
      } catch {
        failTerminalVoiceRecorder("Recording failed");
      }
    }
    return;
  }
  const recognition = terminalVoiceState.recognition;
  terminalVoiceState.recognition = null;
  if (cancel) recognition?.abort?.();
  else recognition?.stop?.();
  if (!cancel) terminalVoiceSetStatus("Transcribing");
}
