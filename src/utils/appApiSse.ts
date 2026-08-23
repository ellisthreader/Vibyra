import { getBackendStreamTimeoutMessage } from "./appApiMessages";

export type ChatStreamCallbacks = {
  onChunk?: (delta: string) => void;
};

type StreamTimeoutState = {
  didTimeOut: () => boolean;
  timeoutMs: number;
  url: string;
};

export async function readStreamingResponse<T>(
  body: ReadableStream<Uint8Array>,
  timeout: ReturnType<typeof setTimeout>,
  callbacks: ChatStreamCallbacks,
  timeoutState: StreamTimeoutState
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
