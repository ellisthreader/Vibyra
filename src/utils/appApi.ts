import { Platform } from "react-native";
import { assertBackendReachableBeforeChat } from "./appApiReachability";
import { fetchWithTimeout, getExpoHost, normalizeAgentUrl, TimeoutError } from "./network";

export type { AuthResponse, BillingPlan, BillingPlansResponse, BillingTopup, ChatResponse, ChatSkill, CheckoutResponse, IapReceiptResponse, LevelActivityResponse, LevelMapNode, LevelProgress, RemoteUser, SessionResponse, SkillsResponse } from "./appApiTypes";

type ApiErrorPayload = {
  error?: string;
  message?: string;
};

export class AppApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly endpoint: string,
    public readonly payload: ApiErrorPayload | Record<string, never>
  ) {
    super(message);
    this.name = "AppApiError";
  }
}

export function getAppApiUrl() {
  if (process.env.EXPO_PUBLIC_API_URL) {
    return normalizeAgentUrl(process.env.EXPO_PUBLIC_API_URL);
  }

  const host = getExpoHost();
  if (host && Platform.OS !== "web") {
    return `http://${host}:8000`;
  }

  return "http://127.0.0.1:8000";
}

const BACKEND_OFFLINE_COOLDOWN_MS = 60000;
let backendOfflineUntil = 0;
let backendKnownOnline = false;

export function isBackendKnownOffline() {
  return Date.now() < backendOfflineUntil;
}

export function markBackendOffline() {
  backendOfflineUntil = Date.now() + BACKEND_OFFLINE_COOLDOWN_MS;
  backendKnownOnline = false;
}

export function markBackendOnline() {
  backendOfflineUntil = 0;
  backendKnownOnline = true;
}

function shouldSkipBackgroundRequest() {
  if (isBackendKnownOffline()) return true;

  return !backendKnownOnline && process.env.EXPO_PUBLIC_ALLOW_BACKGROUND_API_PROBES !== "true";
}

export class BackendOfflineError extends Error {
  constructor(url: string) {
    super(`Backend marked offline; skipping request to ${url}`);
    this.name = "BackendOfflineError";
  }
}

export function isAppSessionExpiredMessage(message: string) {
  const lower = message.toLowerCase();
  return lower.includes("your session expired")
    || lower.includes("missing app session token")
    || (lower.includes("log in") && lower.includes("session"));
}

export type AppApiRequestMeta = {
  /**
   * When true, the request is silently skipped if the backend is currently
   * marked offline or has not yet been proven reachable by a foreground
   * request. Use for background syncs/polls so they don't spam the console
   * with ERR_CONNECTION_REFUSED while the API is down.
   */
  background?: boolean;
};

export async function appApiRequest<T>(
  endpoint: string,
  options: RequestInit = {},
  token?: string,
  meta: AppApiRequestMeta = {}
) {
  const url = `${getAppApiUrl()}${endpoint}`;

  if (meta.background && shouldSkipBackgroundRequest()) {
    throw new BackendOfflineError(url);
  }

  const headers = buildHeaders(options.headers, token);

  let response: Response;
  try {
    if (endpoint === "/api/chat" && !backendKnownOnline) {
      await assertBackendReachableBeforeChat(getAppApiUrl(), markBackendOnline, markBackendOffline);
    }
    response = await fetchWithTimeout(url, {
      ...options,
      headers
    }, requestTimeoutFor(endpoint));
  } catch (error) {
    const reason = error instanceof Error ? error.message : "unknown error";
    const timedOut = error instanceof TimeoutError || reason.toLowerCase().includes("timed out");
    if (timedOut && endpoint === "/api/chat") {
      throw new Error("Vibyra AI chat timed out while generating the preview edit. Try a smaller change or retry.");
    }
    const aborted = reason.toLowerCase().includes("abort");
    if (!aborted && !timedOut) markBackendOffline();
    throw new Error(timedOut || aborted
      ? `Could not reach Vibyra (timed out at ${url}). Start Vibyra with npm start, and check EXPO_PUBLIC_API_URL points to this machine's LAN IP.`
      : `Could not reach Vibyra at ${url}. ${reason}. Start Vibyra with npm start; if the backend is already running, check EXPO_PUBLIC_API_URL in .env and restart Expo.`);
  }

  if (response.status >= 500) {
    markBackendOffline();
  } else {
    markBackendOnline();
  }

  const data = await readJson<ApiErrorPayload | T>(response);

  if (!response.ok) {
    const errorPayload = data as ApiErrorPayload;
    throw new AppApiError(
      errorPayload.error || errorPayload.message || `Request failed with ${response.status}`,
      response.status,
      endpoint,
      errorPayload
    );
  }

  return data as T;
}

function requestTimeoutFor(endpoint: string) {
  if (endpoint === "/api/chat") return 120000;
  if (endpoint === "/api/community/assets/generate") return 100000;
  if (endpoint === "/api/community/projects") return 30000;
  return 15000;
}

export type ChatStreamCallbacks = {
  onChunk?: (delta: string) => void;
};

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
  const timeout = setTimeout(() => controller.abort(), 180000);

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
    markBackendOffline();
    throw new Error(`Could not reach Vibyra at ${url}. ${reason}. Start Vibyra with npm start; if the backend is already running, check EXPO_PUBLIC_API_URL in .env and restart Expo.`);
  }

  if (response.status >= 500) markBackendOffline();
  else markBackendOnline();

  if (!response.ok) {
    clearTimeout(timeout);
    const text = await response.text().catch(() => "");
    let parsed: ApiErrorPayload = {};
    try {
      parsed = text ? JSON.parse(text) as ApiErrorPayload : {};
    } catch {
      parsed = { error: text };
    }
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

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let finalPayload: T | null = null;
  let streamError: string | null = null;

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let separatorIndex: number;
      while ((separatorIndex = buffer.indexOf("\n\n")) !== -1) {
        const rawEvent = buffer.slice(0, separatorIndex);
        buffer = buffer.slice(separatorIndex + 2);
        const { event, data } = parseSseBlock(rawEvent);
        if (!data) continue;
        let parsed: unknown;
        try {
          parsed = JSON.parse(data);
        } catch {
          continue;
        }
        if (event === "chunk") {
          const delta = typeof (parsed as { delta?: unknown }).delta === "string"
            ? (parsed as { delta: string }).delta
            : "";
          if (delta) callbacks.onChunk?.(delta);
        } else if (event === "final") {
          finalPayload = parsed as T;
        } else if (event === "error") {
          streamError = typeof (parsed as { error?: unknown }).error === "string"
            ? (parsed as { error: string }).error
            : "Streaming error";
        }
      }
    }
  } finally {
    clearTimeout(timeout);
    try { reader.releaseLock(); } catch { /* ignore */ }
  }

  if (streamError) throw new Error(streamError);
  if (!finalPayload) throw new Error("Vibyra streaming ended without a final payload. Try again.");
  return finalPayload;
}

function supportsStreamingChatResponse() {
  return Platform.OS === "web";
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

export function isAppSessionExpiredError(error: unknown) {
  if (error instanceof AppApiError) {
    if (error.status !== 401) return false;
    return error.endpoint === "/api/session"
      || error.endpoint === "/api/session/state"
      || isAppSessionExpiredMessage(error.message);
  }

  return error instanceof Error && isAppSessionExpiredMessage(error.message);
}

function buildHeaders(input: RequestInit["headers"], token?: string) {
  const headers: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/json"
  };

  if (input instanceof Headers) {
    input.forEach((value, key) => {
      headers[key] = value;
    });
  } else if (Array.isArray(input)) {
    input.forEach(([key, value]) => {
      headers[key] = value;
    });
  } else if (input) {
    Object.entries(input).forEach(([key, value]) => {
      headers[key] = String(value);
    });
  }

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  return headers;
}

async function readJson<T>(response: Response): Promise<T | Record<string, never>> {
  const text = await response.text();
  if (!text) return {};

  try {
    return JSON.parse(text) as T;
  } catch {
    return { message: text } as T;
  }
}
