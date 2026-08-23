import { assertBackendReachableBeforeChat } from "./appApiReachability";
import { getBackendReachabilityMessage } from "./appApiMessages";
import type { ApiErrorPayload } from "./appApiErrors";
import { AppApiError, BackendOfflineError } from "./appApiErrors";
import { buildAppApiHeaders, readAppApiJson, requestTimeoutFor } from "./appApiRequestHelpers";
import { getAppApiCandidateUrls, getAppApiFetchRedirect, getAppApiRetryCandidateUrls, getAppApiUrl, rememberAppApiUrl } from "./appApiRuntimeOrigins";
import { fetchWithTimeout, TimeoutError } from "./network";

export type { AuthResponse, BillingPlan, BillingPlansResponse, BillingTopup, ChatResponse, ChatSkill, CheckoutResponse, IapReceiptResponse, LevelActivityResponse, LevelMapNode, LevelProgress, ReferralSummary, ReferralSummaryResponse, RemoteUser, SessionResponse, SkillsResponse } from "./appApiTypes";
export { AppApiError, BackendOfflineError, isAppSessionExpiredError, isAppSessionExpiredMessage } from "./appApiErrors";
export { getAppApiCandidateUrls, getAppApiFetchRedirect, getAppApiRetryCandidateUrls, getAppApiUrl, rememberAppApiUrl } from "./appApiRuntimeOrigins";
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

export async function resolveReachableAppApiUrl(timeoutMs = 3500) {
  for (const candidate of getAppApiCandidateUrls()) {
    try {
      const response = await fetchWithTimeout(`${candidate}/api/skills`, { headers: { Accept: "application/json" } }, timeoutMs);
      if (!response.ok) continue;
      rememberAppApiUrl(candidate);
      markBackendOnline();
      return candidate;
    } catch {
      // Try the next candidate.
    }
  }
  return getAppApiUrl();
}

function shouldSkipBackgroundRequest() {
  if (isBackendKnownOffline()) return true;

  return !backendKnownOnline && process.env.EXPO_PUBLIC_ALLOW_BACKGROUND_API_PROBES !== "true";
}

export type AppApiRequestMeta = {
  /** Skip background sync/polls until a foreground request proves reachability. */
  background?: boolean;
};

export async function appApiRequest<T>(
  endpoint: string,
  options: RequestInit = {},
  token?: string,
  meta: AppApiRequestMeta = {}
) {
  const apiUrl = getAppApiUrl();
  const url = `${apiUrl}${endpoint}`;

  if (meta.background && shouldSkipBackgroundRequest()) {
    throw new BackendOfflineError(url);
  }

  const headers = buildAppApiHeaders(options.headers, token);

  let response: Response;
  try {
    if (endpoint === "/api/chat" && !backendKnownOnline) {
      await assertBackendReachableBeforeChat(apiUrl, markBackendOnline, markBackendOffline);
    }
    response = await fetchWithTimeout(url, {
      ...options,
      headers,
      redirect: getAppApiFetchRedirect()
    }, requestTimeoutFor(endpoint));
  } catch (error) {
    if (!meta.background) {
      const retry = await retryAppApiRequestOnFallbackUrl(endpoint, options, headers, apiUrl);
      if (retry) {
        response = retry;
      } else {
        throw appApiReachabilityError(endpoint, url, error);
      }
    } else {
      throw appApiReachabilityError(endpoint, url, error);
    }
  }

  if (response.status >= 500 && endpoint !== "/api/chat/research-plan") {
    markBackendOffline();
  } else {
    markBackendOnline();
  }

  const data = await readAppApiJson<ApiErrorPayload | T>(response);

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

function appApiReachabilityError(endpoint: string, url: string, error: unknown) {
  const reason = error instanceof Error ? error.message : "unknown error";
  const timedOut = error instanceof TimeoutError || reason.toLowerCase().includes("timed out");
  if (timedOut && endpoint === "/api/chat") {
    return new Error("Vibyra AI chat timed out while generating the preview edit. Try a smaller change or retry.");
  }
  const aborted = reason.toLowerCase().includes("abort");
  if (!aborted && !timedOut) markBackendOffline();
  return new Error(getBackendReachabilityMessage(url, reason, timedOut || aborted));
}

async function retryAppApiRequestOnFallbackUrl(
  endpoint: string,
  options: RequestInit,
  headers: Record<string, string>,
  failedApiUrl: string
) {
  for (const candidate of getAppApiRetryCandidateUrls(failedApiUrl)) {
    try {
      const response = await fetchWithTimeout(`${candidate}${endpoint}`, {
        ...options,
        headers,
        redirect: getAppApiFetchRedirect()
      }, requestTimeoutFor(endpoint));
      rememberAppApiUrl(candidate);
      return response;
    } catch {
      // Try the next candidate; the original error remains the user-facing one.
    }
  }
  return null;
}
