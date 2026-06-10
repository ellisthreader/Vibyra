import { Readable } from "node:stream";
import { desktopAppApiUrl } from "./appApiConfig.mjs";
import { appState } from "./state.mjs";
import { clearDesktopAccount } from "./desktopAccount.mjs";
import { makeBillingFailureNonRetryable } from "./desktopBillingErrors.mjs";
import { headers, send } from "./http.mjs";

const API_URL = desktopAppApiUrl();

export async function proxyDesktopCodexResponse(req, res, body, fetchImpl = fetch) {
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
    response = await fetchImpl(`${API_URL}/api/codex/responses`, {
      method: "POST",
      headers: {
        Accept: "text/event-stream",
        Authorization: `Bearer ${appState.desktopAccountToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body),
      signal: controller.signal
    });
  } catch (error) {
    removeDisconnectListeners(req, res, abortUpstream);
    if (controller.signal.aborted || res.destroyed) return;
    send(res, 502, { error: { message: error instanceof Error ? error.message : "Could not reach the Vibyra backend." } });
    return;
  }
  if (response.status === 401) {
    clearDesktopAccount("Your Vibyra session expired. Sign in again to continue.");
  }
  response = await makeBillingFailureNonRetryable(response);

  const contentType = response.headers.get("content-type") || "application/json";
  const billingCode = response.headers.get("x-vibyra-billing-code");
  const billingStatus = response.headers.get("x-vibyra-billing-status");
  res.writeHead(response.status, {
    ...headers(contentType),
    "Cache-Control": "no-cache, no-store",
    "X-Accel-Buffering": "no",
    ...(billingCode ? { "X-Vibyra-Billing-Code": billingCode } : {}),
    ...(billingStatus ? { "X-Vibyra-Billing-Status": billingStatus } : {})
  });
  if (!response.body) {
    removeDisconnectListeners(req, res, abortUpstream);
    res.end();
    return;
  }
  try {
    await pipeUpstreamBody(response.body, res);
  } finally {
    removeDisconnectListeners(req, res, abortUpstream);
  }
}

function removeDisconnectListeners(req, res, listener) {
  req.off("aborted", listener);
  res.off("close", listener);
}

function pipeUpstreamBody(body, res) {
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
