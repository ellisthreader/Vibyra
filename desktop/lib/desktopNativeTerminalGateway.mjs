import { Readable } from "node:stream";
import { desktopAppApiUrl } from "./appApiConfig.mjs";
import { appState } from "./state.mjs";
import { clearDesktopAccount } from "./desktopAccount.mjs";
import { makeBillingFailureNonRetryable } from "./desktopBillingErrors.mjs";
import { headers, send } from "./http.mjs";
import {
  createNativeStreamTranslator,
  nativeRequestToResponses
} from "./desktopNativeTerminalProtocol.mjs";

const API_URL = desktopAppApiUrl();

export async function proxyNativeTerminalRequest(req, res, endpoint, body, fetchImpl = fetch) {
  if (!appState.desktopAccountToken) {
    send(res, 401, { error: { message: "Log in to Vibyra Desktop before using Vibyra tokens." } });
    return;
  }

  const controller = new AbortController();
  const abortUpstream = () => {
    if (!res.writableEnded) controller.abort();
  };
  req.once("aborted", abortUpstream);
  res.once("close", abortUpstream);

  let response;
  try {
    response = await fetchImpl(`${API_URL}${endpoint}`, {
      method: "POST",
      headers: {
        Accept: req.headers.accept || "application/json",
        Authorization: `Bearer ${appState.desktopAccountToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body),
      signal: controller.signal
    });
  } catch (error) {
    removeListeners(req, res, abortUpstream);
    if (controller.signal.aborted || res.destroyed) return;
    send(res, 502, {
      error: {
        message: error instanceof Error ? error.message : "Could not reach the Vibyra backend."
      }
    });
    return;
  }

  if (response.status === 401) {
    clearDesktopAccount("Your Vibyra session expired. Sign in again to continue.");
  }
  const contentType = response.headers.get("content-type") || "application/json";
  res.writeHead(response.status, {
    ...headers(contentType),
    "Cache-Control": "no-cache, no-store",
    "X-Accel-Buffering": "no"
  });
  if (!response.body) {
    removeListeners(req, res, abortUpstream);
    res.end();
    return;
  }
  try {
    await pipeBody(response.body, res);
  } finally {
    removeListeners(req, res, abortUpstream);
  }
}

export async function proxyNativeTerminalProtocol(
  req,
  res,
  { protocol, billingModel, body, streamResponse = true },
  fetchImpl = fetch
) {
  if (!appState.desktopAccountToken) {
    send(res, 401, { error: { message: "Log in to Vibyra Desktop before using Vibyra tokens." } });
    return;
  }
  const controller = new AbortController();
  const abortUpstream = () => {
    if (!res.writableEnded) controller.abort();
  };
  req.once("aborted", abortUpstream);
  res.once("close", abortUpstream);

  let response;
  try {
    const requestBody = nativeRequestToResponses(protocol, body, billingModel);
    response = await fetchImpl(`${API_URL}/api/codex/responses`, {
      method: "POST",
      headers: {
        Accept: "text/event-stream",
        Authorization: `Bearer ${appState.desktopAccountToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal
    });
  } catch (error) {
    removeListeners(req, res, abortUpstream);
    if (controller.signal.aborted || res.destroyed) return;
    send(res, 502, { error: { message: error instanceof Error ? error.message : "Could not reach Vibyra." } });
    return;
  }
  if (response.status === 401) {
    clearDesktopAccount("Your Vibyra session expired. Sign in again to continue.");
  }
  response = await makeBillingFailureNonRetryable(response);
  if (!response.ok || !response.body) {
    const payload = await nativeErrorPayload(protocol, response);
    removeListeners(req, res, abortUpstream);
    res.writeHead(response.status, headers("application/json"));
    res.end(JSON.stringify(payload));
    return;
  }

  if (streamResponse) {
    res.writeHead(200, {
      ...headers("text/event-stream"),
      "Cache-Control": "no-cache, no-store",
      "X-Accel-Buffering": "no"
    });
  }
  let translated = "";
  const translator = createNativeStreamTranslator(protocol, (chunk) => {
    if (streamResponse) {
      if (!res.destroyed && !res.writableEnded) res.write(chunk);
    } else {
      translated += chunk;
    }
  });
  let buffer = "";
  try {
    for await (const chunk of Readable.fromWeb(response.body)) {
      buffer += chunk.toString("utf8");
      const parsed = pullSseEvents(buffer);
      buffer = parsed.remaining;
      for (const event of parsed.events) translator.event(event);
    }
    for (const event of pullSseEvents(`${buffer}\n\n`).events) translator.event(event);
  } finally {
    removeListeners(req, res, abortUpstream);
    if (!res.writableEnded) {
      if (streamResponse) res.end();
      else send(res, 200, geminiNonStreamPayload(translated));
    }
  }
}

function geminiNonStreamPayload(stream) {
  const parts = [];
  let finishReason = "STOP";
  let usageMetadata = {};
  for (const raw of String(stream || "").split(/\r?\n\r?\n/)) {
    const data = raw.split(/\r?\n/)
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trimStart())
      .join("\n");
    if (!data) continue;
    try {
      const payload = JSON.parse(data);
      const candidate = payload.candidates?.[0];
      if (Array.isArray(candidate?.content?.parts)) parts.push(...candidate.content.parts);
      if (candidate?.finishReason) finishReason = candidate.finishReason;
      if (payload.usageMetadata) usageMetadata = payload.usageMetadata;
    } catch {}
  }
  return {
    candidates: [{ content: { role: "model", parts }, finishReason }],
    usageMetadata
  };
}

async function nativeErrorPayload(protocol, response) {
  const text = await response.text();
  let payload = {};
  try {
    payload = JSON.parse(text);
  } catch {}
  const source = payload?.error || {};
  const message = String(
    source.message
    || payload?.message
    || text.trim()
    || `Vibyra request failed with HTTP ${response.status}.`
  );
  const code = String(
    source.code
    || response.headers.get("x-vibyra-billing-source-code")
    || response.headers.get("x-vibyra-billing-code")
    || ""
  );
  const details = source.details && typeof source.details === "object" ? { ...source.details } : {};
  const inferredCode = response.headers.get("x-vibyra-billing-code");
  const billingStatus = Number(response.headers.get("x-vibyra-billing-status"));
  if (inferredCode) details.inferredCode = inferredCode;
  if (billingStatus > 0) details.billingStatus = billingStatus;
  if (protocol === "anthropic") {
    return {
      type: "error",
      error: {
        type: response.status === 429 ? "rate_limit_error" : "invalid_request_error",
        message,
        ...(code ? { code } : {}),
        ...(Object.keys(details).length ? { details } : {})
      }
    };
  }
  if (protocol === "openai-chat-completions") {
    return {
      error: {
        message,
        type: response.status === 429 ? "rate_limit_error" : "invalid_request_error",
        code: code || response.status,
        ...(Object.keys(details).length ? { details } : {})
      }
    };
  }
  return {
    error: {
      code: response.status,
      message,
      status: response.status === 429 ? "RESOURCE_EXHAUSTED" : "FAILED_PRECONDITION",
      ...(code || Object.keys(details).length ? { details: [{ code, ...details }] } : {})
    }
  };
}

function removeListeners(req, res, listener) {
  req.off("aborted", listener);
  res.off("close", listener);
}

function pipeBody(body, res) {
  return new Promise((resolve) => {
    const upstream = Readable.fromWeb(body);
    const finish = () => {
      if (res.destroyed && !upstream.destroyed) upstream.destroy();
      upstream.off("error", onError);
      res.off("finish", finish);
      res.off("close", finish);
      resolve();
    };
    const onError = () => {
      if (!res.destroyed && !res.writableEnded) res.end();
      finish();
    };
    upstream.once("error", onError);
    res.once("finish", finish);
    res.once("close", finish);
    upstream.pipe(res);
  });
}

function pullSseEvents(buffer) {
  const parts = buffer.split(/\r?\n\r?\n/);
  const remaining = parts.pop() || "";
  const events = [];
  for (const raw of parts) {
    let name = "";
    const data = [];
    for (const line of raw.split(/\r?\n/)) {
      if (line.startsWith("event:")) name = line.slice(6).trim();
      if (line.startsWith("data:")) data.push(line.slice(5).trimStart());
    }
    if (data.join("\n") === "[DONE]") continue;
    try {
      events.push({ name, data: JSON.parse(data.join("\n")) });
    } catch {}
  }
  return { events, remaining };
}
