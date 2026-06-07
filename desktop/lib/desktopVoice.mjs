import { openAiAccountCredential, openAiHeaders } from "./providerAccounts.mjs";

const OPENAI_TRANSCRIPT_URL = "https://api.openai.com/v1/audio/transcriptions";
const MAX_AUDIO_BYTES = 8_000_000;

export async function transcribeDesktopVoice(body = {}, fetchImpl = fetch) {
  const credential = openAiAccountCredential();
  if (!credential) throw httpError(401, "Connect an OpenAI account to use Vibyra Voice transcription.");
  const audio = Buffer.from(String(body.audioBase64 || ""), "base64");
  if (!audio.length) throw httpError(422, "No voice recording was received.");
  if (audio.length > MAX_AUDIO_BYTES) throw httpError(413, "Voice recording is too large. Keep it under one minute.");

  const form = new FormData();
  form.set("model", "gpt-4o-mini-transcribe");
  form.set("file", new Blob([audio], { type: String(body.mimeType || "audio/webm") }), "vibyra-voice.webm");
  const response = await fetchImpl(OPENAI_TRANSCRIPT_URL, {
    method: "POST",
    headers: openAiHeaders(credential),
    body: form
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw httpError(response.status || 500, payload?.error?.message || "Voice transcription failed.");
  return { ok: true, text: String(payload?.text || "").trim() };
}

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}
