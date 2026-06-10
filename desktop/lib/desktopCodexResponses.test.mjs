import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { PassThrough, Readable } from "node:stream";
import test from "node:test";
import { desktopAppApiUrl } from "./appApiConfig.mjs";
import { appState } from "./state.mjs";
import { proxyDesktopCodexResponse } from "./desktopCodexResponses.mjs";

test("propagates client disconnect to the upstream request", async () => {
  appState.desktopAccountToken = "account-token";
  const req = new EventEmitter();
  const res = responseStream();
  let signal;
  const pending = proxyDesktopCodexResponse(req, res, { model: "test" }, async (_url, options) => {
    signal = options.signal;
    return new Promise((_resolve, reject) => {
      options.signal.addEventListener("abort", () => reject(options.signal.reason), { once: true });
    });
  });

  res.emit("close");
  await pending;
  assert.equal(signal.aborted, true);
});

test("streams the upstream response and contains stream failures", async () => {
  appState.desktopAccountToken = "account-token";
  const req = new EventEmitter();
  const res = responseStream();
  const brokenBody = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode("data: first\n\n"));
      controller.error(new Error("stream failed"));
    }
  });

  await proxyDesktopCodexResponse(req, res, {}, async () => new Response(brokenBody, {
    status: 200,
    headers: { "content-type": "text/event-stream" }
  }));
  assert.equal(res.statusCode, 200);
  assert.equal(res.writableEnded, true);
});

test("forwards account authorization and the abort signal", async () => {
  appState.desktopAccountToken = "account-token";
  const req = new EventEmitter();
  const res = responseStream();
  let captured;
  await proxyDesktopCodexResponse(req, res, { model: "test" }, async (url, options) => {
    captured = { url, options };
    return new Response("ok", { status: 200, headers: { "content-type": "text/plain" } });
  });

  assert.equal(captured.url, `${desktopAppApiUrl()}/api/codex/responses`);
  assert.equal(captured.options.headers.Authorization, "Bearer account-token");
  assert.ok(captured.options.signal instanceof AbortSignal);
  assert.equal(res.body, "ok");
});

test("makes backend billing limits non-retryable for native Codex", async () => {
  appState.desktopAccountToken = "account-token";
  appState.desktopAccount = {
    burstCreditsUsed: 13,
    burstCreditsCap: 15,
    burstCreditsResetAt: "2026-06-09T18:31:53+00:00",
    weeklyCreditsUsed: 13,
    weeklyCreditsCap: 50,
    weeklyCreditsResetAt: "2026-06-16T13:31:53+00:00"
  };
  const req = new EventEmitter();
  const res = responseStream();

  await proxyDesktopCodexResponse(req, res, {}, async () => new Response(JSON.stringify({
    error: {
      message: "Your current AI usage window does not have enough capacity for this request.",
      code: "billing_usage_cap"
    }
  }), {
    status: 429,
    headers: { "content-type": "application/json" }
  }));

  assert.equal(res.statusCode, 400);
  assert.equal(res.responseHeaders["Content-Type"], "text/plain; charset=utf-8");
  assert.equal(res.responseHeaders["X-Vibyra-Billing-Code"], "billing_burst_cap");
  assert.equal(res.responseHeaders["X-Vibyra-Billing-Status"], "429");
  assert.match(res.body, /13\/15 credits used/);
  assert.match(res.body, /2026-06-09T18:31:53\+00:00/);
  assert.doesNotMatch(res.body, /"error"|billingStatus|creditsCap/);
});

test("preserves genuine provider rate limits for Codex retries", async () => {
  appState.desktopAccountToken = "account-token";
  const req = new EventEmitter();
  const res = responseStream();

  await proxyDesktopCodexResponse(req, res, {}, async () => new Response(JSON.stringify({
    error: { message: "Provider is busy.", code: "provider_rate_limit" }
  }), {
    status: 429,
    headers: { "content-type": "application/json" }
  }));

  assert.equal(res.statusCode, 429);
});

function responseStream() {
  const res = new PassThrough();
  res.body = "";
  res.on("data", (chunk) => { res.body += chunk.toString(); });
  res.writeHead = (statusCode, headers) => {
    res.statusCode = statusCode;
    res.responseHeaders = headers;
  };
  return res;
}
