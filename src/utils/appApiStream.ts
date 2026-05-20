import { Platform } from "react-native";
import { getBackendReachabilityMessage, getBackendStreamTimeoutMessage } from "./appApiMessages";
import { AppApiError, appApiRequest, getAppApiUrl, markBackendOffline, markBackendOnline } from "./appApi";

type ApiErrorPayload = {
  error?: string;
  message?: string;
};

export type ChatStreamCallbacks = {
  onChunk?: (delta: string) => void;
};

const CHAT_STREAM_TIMEOUT_MS = 180000;
const TOOL_STREAM_TIMEOUT_MS = 300000;
const DEEP_RESEARCH_STREAM_TIMEOUT_MS = 900000;

export async function appApiStreamChat<T = unknown>(
  body: unknown,
  token: string,
  callbacks: ChatStreamCallbacks = {}
): Promise<T> {
  if (!supportsStreamingChatResponse()) {
    return appApiRequest<T>("/api/chat", {
      method: "POST",
      body: JSON.stringify(body)
    }, token);
  }

  const url = `${getAppApiUrl()}/api/chat/stream`;
  const controller = new AbortController();
  const streamTimeoutMs = streamTimeoutFor(body);
  let streamTimedOut = false;
  const timeout = setTimeout(() => {
    streamTimedOut = true;
    controller.abort();
  }, streamTimeoutMs);

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        Accept: "text/event-stream",
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify(body),
      signal: controller.signal
    });
  } catch (error) {
    clearTimeout(timeout);
    const reason = error instanceof Error ? error.message : "unknown error";
    if (streamTimedOut) throw new Error(getBackendStreamTimeoutMessage(url, streamTimeoutMs));
    if (!reason.toLowerCase().includes("abort")) markBackendOffline();
    throw new Error(getBackendReachabilityMessage(url, reason));
  }

  if (response.status >= 500) markBackendOffline();
  else markBackendOnline();

  if (!response.ok) {
    clearTimeout(timeout);
    const text = await response.text().catch(() => "");
    const parsed = parseErrorPayload(text);
    throw new AppApiError(
      parsed.error || parsed.message || `Request failed with ${response.status}`,
      response.status,
      "/api/chat/stream",
      parsed
    );
  }

  if (!response.body) {
    clearTimeout(timeout);
    throw new Error("Vibyra streaming response has no body. Update Expo or fall back to /api/chat.");
  }

  return readStreamingResponse<T>(response.body, timeout, callbacks, {
    didTimeOut: () => streamTimedOut,
    timeoutMs: streamTimeoutMs,
    url
  });
}

function supportsStreamingChatResponse() {
  return Platform.OS === "web";
}

async function readStreamingResponse<T>(
  body: ReadableStream<Uint8Array>,
  timeout: ReturnType<typeof setTimeout>,
  callbacks: ChatStreamCallbacks,
  timeoutState: { didTimeOut: () => boolean; timeoutMs: number; url: string }
) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let finalPayload: T | null = null;
  let streamError: string | null = null;

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const result = consumeSseBuffer<T>(buffer, callbacks);
      buffer = result.buffer;
      finalPayload = result.finalPayload ?? finalPayload;
      streamError = result.streamError ?? streamError;
    }
  } catch (error) {
    if (timeoutState.didTimeOut()) {
      throw new Error(getBackendStreamTimeoutMessage(timeoutState.url, timeoutState.timeoutMs));
    }
    throw error;
  } finally {
    clearTimeout(timeout);
    try { reader.releaseLock(); } catch { /* ignore */ }
  }

  if (streamError) throw new Error(streamError);
  if (!finalPayload) throw new Error("Vibyra streaming ended without a final payload. Try again.");
  return finalPayload;
}

function streamTimeoutFor(body: unknown) {
  if (isDeepResearchStream(body)) return DEEP_RESEARCH_STREAM_TIMEOUT_MS;
  return isToolStream(body) ? TOOL_STREAM_TIMEOUT_MS : CHAT_STREAM_TIMEOUT_MS;
}

function isDeepResearchStream(body: unknown) {
  if (!body || typeof body !== "object") return false;
  const payload = body as { model?: unknown; skill?: unknown };
  const model = typeof payload.model === "string" ? payload.model.toLowerCase() : "";
  const skill = typeof payload.skill === "string" ? payload.skill.toLowerCase() : "";
  return skill === "research" || model === "tool-deep-research" || model.includes("o3-deep-research");
}

function isToolStream(body: unknown) {
  if (!body || typeof body !== "object") return false;
  const payload = body as { model?: unknown; skill?: unknown };
  const model = typeof payload.model === "string" ? payload.model.toLowerCase() : "";
  const skill = typeof payload.skill === "string" ? payload.skill.toLowerCase() : "";
  return skill === "web" || skill === "analyze" || model === "tool-web-search" || model === "tool-analyze-files";
}

function consumeSseBuffer<T>(input: string, callbacks: ChatStreamCallbacks) {
  let buffer = input;
  let finalPayload: T | null = null;
  let streamError: string | null = null;
  let separatorIndex: number;

  while ((separatorIndex = buffer.indexOf("\n\n")) !== -1) {
    const rawEvent = buffer.slice(0, separatorIndex);
    buffer = buffer.slice(separatorIndex + 2);
    const { event, data } = parseSseBlock(rawEvent);
    if (!data) continue;

    const parsed = parseJson(data);
    if (!parsed) continue;
    if (event === "chunk") handleChunk(parsed, callbacks);
    else if (event === "final") finalPayload = parsed as T;
    else if (event === "error") streamError = streamErrorFromPayload(parsed);
  }

  return { buffer, finalPayload, streamError };
}

function handleChunk(parsed: unknown, callbacks: ChatStreamCallbacks) {
  const delta = typeof (parsed as { delta?: unknown }).delta === "string"
    ? (parsed as { delta: string }).delta
    : "";
  if (delta) callbacks.onChunk?.(delta);
}

function streamErrorFromPayload(parsed: unknown) {
  return typeof (parsed as { error?: unknown }).error === "string"
    ? (parsed as { error: string }).error
    : "Streaming error";
}

function parseSseBlock(block: string): { event: string; data: string } {
  let event = "message";
  const dataLines: string[] = [];
  for (const line of block.split(/\r?\n/)) {
    if (line.startsWith("event:")) event = line.slice(6).trim();
    else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
  }
  return { event, data: dataLines.join("\n") };
}

function parseJson(value: string) {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

function parseErrorPayload(text: string): ApiErrorPayload {
  try {
    return text ? JSON.parse(text) as ApiErrorPayload : {};
  } catch {
    return { error: text };
  }
}
