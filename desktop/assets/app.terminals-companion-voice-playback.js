let terminalVoiceAudio = null;
let terminalVoiceAudioUrl = "";
let terminalVoiceSpeechController = null;

async function playTerminalVoiceReply(text, generation) {
  if (!text || !terminalVoiceGenerationCurrent(generation)) return;
  stopTerminalVoicePlayback();
  terminalVoiceSpeechController = new AbortController();
  terminalVoiceSetStatus("Vibyra is responding");
  try {
    const blob = await requestTerminalVoiceAudio(text, terminalVoiceSpeechController.signal);
    if (!terminalVoiceGenerationCurrent(generation)) return;
    await playTerminalVoiceBlob(blob, text, generation);
  } catch (error) {
    if (!terminalVoiceGenerationCurrent(generation) || error?.name === "AbortError") return;
    fallbackTerminalVoicePlayback(text, generation, error);
  }
}

async function requestTerminalVoiceAudio(text, signal) {
  const preferences = desktopVoicePreferences();
  const response = await fetch("/desktop/voice/speak", {
    method: "POST",
    headers: { Accept: "audio/wav, audio/*, application/json", "Content-Type": "application/json" },
    body: JSON.stringify({ text, voice: preferences.voice, speed: preferences.speed }),
    signal
  });
  const contentType = String(response.headers.get("content-type") || "").toLowerCase();
  if (!response.ok) {
    const result = contentType.includes("json") ? await response.json().catch(() => ({})) : {};
    throw new Error(result.error || result.message || "OpenAI voice is unavailable.");
  }
  if (contentType.includes("json")) return terminalVoiceJsonAudio(await response.json());
  const blob = await response.blob();
  if (!blob.size) throw new Error("OpenAI returned empty voice audio.");
  return blob;
}

function terminalVoiceJsonAudio(result) {
  const encoded = String(result?.audioBase64 || "");
  if (!encoded) throw new Error(result?.error || "OpenAI returned invalid voice audio.");
  const bytes = Uint8Array.from(atob(encoded), (character) => character.charCodeAt(0));
  return new Blob([bytes], { type: result.mimeType || result.contentType || "audio/wav" });
}

function playTerminalVoiceBlob(blob, text, generation) {
  terminalVoiceAudioUrl = URL.createObjectURL(blob);
  terminalVoiceAudio = new Audio(terminalVoiceAudioUrl);
  terminalVoiceAudio.onplay = () => {
    if (!terminalVoiceGenerationCurrent(generation)) return;
    terminalVoiceState.speaking = true;
    terminalVoiceSetStatus("Vibyra is speaking");
  };
  terminalVoiceAudio.onended = () => finishTerminalVoicePlayback(generation, "Ready");
  terminalVoiceAudio.onerror = () => {
    if (terminalVoiceGenerationCurrent(generation)) {
      fallbackTerminalVoicePlayback(text, generation, new Error("OpenAI voice audio could not play."));
    }
  };
  return terminalVoiceAudio.play();
}

function fallbackTerminalVoicePlayback(text, generation, error) {
  stopTerminalVoicePlayback();
  if (!terminalVoiceGenerationCurrent(generation)) return;
  terminalVoiceSetStatus("OpenAI voice unavailable; using system voice");
  if (!speakTerminalVoiceWithSystem(text, generation)) {
    terminalVoiceSetStatus(terminalVoiceErrorMessage(error, "Voice audio unavailable"));
  }
}

function speakTerminalVoiceWithSystem(text, generation) {
  if (!window.speechSynthesis || !window.SpeechSynthesisUtterance) return false;
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = desktopVoicePreferences().speed;
  utterance.onstart = () => {
    if (!terminalVoiceGenerationCurrent(generation)) return;
    terminalVoiceState.speaking = true;
    terminalVoiceSetStatus("Using system voice");
  };
  utterance.onend = () => finishTerminalVoicePlayback(generation, "Ready");
  utterance.onerror = () => finishTerminalVoicePlayback(generation, "System voice could not play");
  window.speechSynthesis.speak(utterance);
  return true;
}

function finishTerminalVoicePlayback(generation, status) {
  releaseTerminalVoiceAudio();
  if (!terminalVoiceGenerationCurrent(generation)) return;
  terminalVoiceState.speaking = false;
  terminalVoiceSetStatus(status);
}

function stopTerminalVoicePlayback() {
  terminalVoiceSpeechController?.abort();
  terminalVoiceSpeechController = null;
  if (terminalVoiceAudio) {
    terminalVoiceAudio.onplay = null;
    terminalVoiceAudio.onended = null;
    terminalVoiceAudio.onerror = null;
    terminalVoiceAudio.pause();
    terminalVoiceAudio.removeAttribute("src");
    terminalVoiceAudio.load?.();
  }
  releaseTerminalVoiceAudio();
  window.speechSynthesis?.cancel?.();
  terminalVoiceState.speaking = false;
}

function releaseTerminalVoiceAudio() {
  terminalVoiceAudio = null;
  if (terminalVoiceAudioUrl) URL.revokeObjectURL(terminalVoiceAudioUrl);
  terminalVoiceAudioUrl = "";
}
