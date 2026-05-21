import { Platform } from "react-native";
import { assertBackendReachableBeforeChat } from "./appApiReachability";
import { getBackendReachabilityMessage } from "./appApiMessages";
import { fetchWithTimeout, getExpoHost, normalizeAgentUrl, TimeoutError } from "./network";

export type { AuthResponse, BillingPlan, BillingPlansResponse, BillingTopup, ChatResponse, ChatSkill, CheckoutResponse, IapReceiptResponse, LevelActivityResponse, LevelMapNode, LevelProgress, ReferralSummary, ReferralSummaryResponse, RemoteUser, SessionResponse, SkillsResponse } from "./appApiTypes";

type ApiErrorPayload = {
  burstCreditsResetAt?: string;
  error?: string;
  message?: string;
  weeklyCreditsResetAt?: string;
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
    throw new Error(getBackendReachabilityMessage(url, reason, timedOut || aborted));
  }

  if (response.status >= 500 && endpoint !== "/api/chat/research-plan") {
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
  if (endpoint === "/api/chat") return 240000;
  if (endpoint === "/api/chat/research-plan") return 25000;
  if (endpoint === "/api/community/assets/generate") return 100000;
  if (endpoint === "/api/community/projects") return 30000;
  return 15000;
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
