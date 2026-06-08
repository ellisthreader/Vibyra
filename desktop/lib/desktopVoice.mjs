import { openAiAccountCredential, openAiHeaders } from "./providerAccounts.mjs";

const OPENAI_TRANSCRIPT_URL = "https://api.openai.com/v1/audio/transcriptions";
const OPENAI_SPEECH_URL = "https://api.openai.com/v1/audio/speech";
const MAX_AUDIO_BYTES = 8_000_000;
const MAX_SPEECH_TEXT_CHARS = 1_600;
const TRANSCRIPTION_TIMEOUT_MS = 90_000;
const SPEECH_TIMEOUT_MS = 45_000;
const SPEECH_CONTENT_TYPE = "audio/wav";
const SPEECH_INSTRUCTIONS = "Speak as Vibyra: concise, clear, neutral, and helpful. Do not read markdown formatting aloud.";
const AUDIO_TYPES = new Map([
  ["audio/webm", "webm"],
  ["audio/ogg", "ogg"],
  ["audio/mp4", "m4a"],
  ["audio/mpeg", "mp3"],
  ["audio/wav", "wav"],
  ["audio/x-wav", "wav"]
]);

export async function transcribeDesktopVoice(body = {}, fetchImpl = fetch, credential = openAiAccountCredential()) {
  if (!credential) throw httpError(401, "Connect an OpenAI account to use Vibyra Voice transcription.");
  const encoded = String(body.audioBase64 || "").trim();
  if (!isCanonicalBase64(encoded)) throw httpError(422, "The voice recording is invalid.");
  const audio = Buffer.from(encoded, "base64");
  if (!audio.length) throw httpError(422, "No voice recording was received.");
  if (audio.length > MAX_AUDIO_BYTES) throw httpError(413, "Voice recording is too large. Keep it under one minute.");
  const mimeType = normalizeAudioType(body.mimeType);

  const form = new FormData();
  form.set("model", "gpt-4o-mini-transcribe");
  form.set("file", new Blob([audio], { type: mimeType }), `vibyra-voice.${AUDIO_TYPES.get(mimeType)}`);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TRANSCRIPTION_TIMEOUT_MS);
  let response;
  try {
    response = await fetchImpl(OPENAI_TRANSCRIPT_URL, {
      method: "POST",
      headers: openAiHeaders(credential),
      body: form,
      signal: controller.signal
    });
  } catch (error) {
    if (error?.name === "AbortError") throw httpError(504, "Voice transcription timed out.");
    throw error;
  } finally {
    clearTimeout(timeout);
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw httpError(response.status || 500, payload?.error?.message || "Voice transcription failed.");
  return { ok: true, text: String(payload?.text || "").trim() };
}

export async function speakDesktopVoice(
  body = {},
  fetchImpl = fetch,
  credential = openAiAccountCredential(),
  timeoutMs = SPEECH_TIMEOUT_MS
) {
  if (!credential) throw httpError(401, "Connect an OpenAI account to use Vibyra Voice speech.");
  const input = normalizeSpeechText(body.text);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  let response;
  try {
    response = await fetchImpl(OPENAI_SPEECH_URL, {
      method: "POST",
      headers: {
        ...openAiHeaders(credential),
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4o-mini-tts",
        voice: "marin",
        input,
        instructions: SPEECH_INSTRUCTIONS,
        response_format: "wav"
      }),
      signal: controller.signal
    });
    if (!response.ok) {
      const status = response.status >= 400 && response.status < 500 ? response.status : 502;
      throw httpError(status, "OpenAI could not create the Vibyra Voice response.");
    }
    const audio = Buffer.from(await response.arrayBuffer());
    if (!audio.length) throw httpError(502, "OpenAI returned an empty Vibyra Voice response.");
    return { audio, contentType: SPEECH_CONTENT_TYPE };
  } catch (error) {
    if (error?.vibyraSafe) throw error;
    if (error?.name === "AbortError") throw httpError(504, "Voice speech generation timed out.");
    throw httpError(502, "Vibyra Voice could not reach the speech service.");
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeSpeechText(value) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (!text) throw httpError(422, "Voice response text is required.");
  if (text.length > MAX_SPEECH_TEXT_CHARS) {
    throw httpError(413, `Voice response text must be ${MAX_SPEECH_TEXT_CHARS} characters or fewer.`);
  }
  return text;
}

function normalizeAudioType(value) {
  const mimeType = String(value || "audio/webm").split(";")[0].trim().toLowerCase();
  if (!AUDIO_TYPES.has(mimeType)) throw httpError(415, "This voice recording format is not supported.");
  return mimeType;
}

function isCanonicalBase64(value) {
  if (!value || value.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) return false;
  return Buffer.from(value, "base64").toString("base64") === value;
}

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  error.vibyraSafe = true;
  return error;
}
