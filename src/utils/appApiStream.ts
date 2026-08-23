import { Platform } from "react-native";
import { getBackendReachabilityMessage, getBackendStreamTimeoutMessage } from "./appApiMessages";
import { AppApiError, appApiRequest, getAppApiFetchRedirect, getAppApiRetryCandidateUrls, markBackendOffline, markBackendOnline, rememberAppApiUrl, resolveReachableAppApiUrl } from "./appApi";
import type { ChatStreamCallbacks } from "./appApiSse";
import { readStreamingResponse } from "./appApiSse";
import { streamTimeoutFor } from "./appApiStreamPolicy";

type ApiErrorPayload = {
  error?: string;
  message?: string;
};

export type { ChatStreamCallbacks } from "./appApiSse";

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

  const apiUrl = await resolveReachableAppApiUrl();
  const url = `${apiUrl}/api/chat/stream`;
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
      redirect: getAppApiFetchRedirect(),
      signal: controller.signal
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : "unknown error";
    if (!streamTimedOut) {
      const retry = await retryStreamOnFallbackUrl(apiUrl, body, token, controller.signal);
      if (retry) {
        response = retry;
      } else {
        clearTimeout(timeout);
        if (!reason.toLowerCase().includes("abort")) markBackendOffline();
        throw new Error(getBackendReachabilityMessage(url, reason));
      }
    } else {
      clearTimeout(timeout);
      throw new Error(getBackendStreamTimeoutMessage(url, streamTimeoutMs));
    }
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

async function retryStreamOnFallbackUrl(
  failedApiUrl: string,
  body: unknown,
  token: string,
  signal: AbortSignal
) {
  for (const candidate of getAppApiRetryCandidateUrls(failedApiUrl)) {
    try {
      const response = await fetch(`${candidate}/api/chat/stream`, {
        method: "POST",
        headers: {
          Accept: "text/event-stream",
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(body),
        redirect: getAppApiFetchRedirect(),
        signal
      });
      rememberAppApiUrl(candidate);
      return response;
    } catch {
      // Keep trying candidates; the original stream error remains user-facing.
    }
  }
  return null;
}

function supportsStreamingChatResponse() {
  return Platform.OS === "web";
}

function parseErrorPayload(text: string): ApiErrorPayload {
  try {
    return text ? JSON.parse(text) as ApiErrorPayload : {};
  } catch {
    return { error: text };
  }
}
