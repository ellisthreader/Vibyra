import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import test from "node:test";
import { desktopAppApiUrl } from "./appApiConfig.mjs";
import { appState } from "./state.mjs";
import { proxyNativeTerminalProtocol } from "./desktopNativeTerminalGateway.mjs";

test("Claude billing limits use a non-retryable Anthropic error envelope", async () => {
  appState.desktopAccountToken = "account-token";
  appState.desktopAccount = {
    burstCreditsUsed: 13,
    burstCreditsCap: 15,
    burstCreditsResetAt: "2026-06-09T18:31:53+00:00",
    weeklyCreditsUsed: 13,
    weeklyCreditsCap: 50
  };
  const res = responseStream();

  await proxyNativeTerminalProtocol(new EventEmitter(), res, {
    protocol: "anthropic",
    billingModel: "anthropic/claude-haiku-4.5",
    body: { messages: [] }
  }, async () => billingLimitResponse());

  const payload = JSON.parse(res.body);
  assert.equal(res.statusCode, 400);
  assert.equal(payload.type, "error");
  assert.equal(payload.error.type, "invalid_request_error");
  assert.equal(payload.error.code, "billing_usage_cap");
  assert.match(payload.error.message, /13\/15 credits used/);
  assert.match(payload.error.message, /2026-06-09T18:31:53\+00:00/);
});

test("Gemini billing limits use a non-retryable Gemini error envelope", async () => {
  appState.desktopAccountToken = "account-token";
  const res = responseStream();

  await proxyNativeTerminalProtocol(new EventEmitter(), res, {
    protocol: "gemini",
    billingModel: "google/gemini-3.5-flash",
    body: { contents: [] }
  }, async () => billingLimitResponse());

  const payload = JSON.parse(res.body);
  assert.equal(res.statusCode, 400);
  assert.equal(payload.error.status, "FAILED_PRECONDITION");
  assert.equal(payload.error.details[0].code, "billing_usage_cap");
});

test("direct burst-limit codes retain exact account capacity and reset details", async () => {
  appState.desktopAccountToken = "account-token";
  appState.desktopAccount = {
    burstCreditsUsed: 13,
    burstCreditsCap: 15,
    burstCreditsResetAt: "2026-06-09T18:31:53+00:00"
  };
  const res = responseStream();

  await proxyNativeTerminalProtocol(new EventEmitter(), res, {
    protocol: "anthropic",
    billingModel: "anthropic/claude-haiku-4.5",
    body: { messages: [] }
  }, async () => billingLimitResponse("billing_burst_cap"));

  const payload = JSON.parse(res.body);
  assert.equal(payload.error.code, "billing_burst_cap");
  assert.match(payload.error.message, /13\/15 credits used/);
  assert.match(payload.error.message, /2026-06-09T18:31:53\+00:00/);
});

test("Grok credit exhaustion identifies Vibyra billing instead of the CLI key", async () => {
  appState.desktopAccountToken = "account-token";
  appState.desktopAccount = {
    creditsBalance: 0,
    creditsResetAt: "2026-07-11T13:31:53+00:00",
    weeklyCreditsUsed: 50,
    weeklyCreditsCap: 50,
    weeklyCreditsResetAt: "2026-06-16T13:31:53+00:00"
  };
  const res = responseStream();

  await proxyNativeTerminalProtocol(new EventEmitter(), res, {
    protocol: "openai-chat-completions",
    billingModel: "x-ai/grok-build-0.1",
    body: { messages: [] }
  }, async () => new Response(JSON.stringify({
    error: {
      message: "You do not have enough credits for this request.",
      code: "billing_credits_exhausted",
      details: {
        creditsBalance: 0,
        estimatedCredits: 4,
        billingStatus: 402
      }
    }
  }), {
    status: 400,
    headers: { "content-type": "application/json" }
  }));

  const payload = JSON.parse(res.body);
  assert.equal(res.statusCode, 400);
  assert.equal(payload.error.code, "billing_credits_exhausted");
  assert.match(payload.error.message, /Vibyra token balance has 0 credits remaining/);
  assert.match(payload.error.message, /needs about 4 credits/);
  assert.match(payload.error.message, /weekly window is also full \(50\/50\)/);
  assert.match(payload.error.message, /not a company CLI API-key error/);
});

test("genuine provider rate limits remain retryable in native protocols", async () => {
  appState.desktopAccountToken = "account-token";
  const res = responseStream();

  await proxyNativeTerminalProtocol(new EventEmitter(), res, {
    protocol: "anthropic",
    billingModel: "anthropic/claude-haiku-4.5",
    body: { messages: [] }
  }, async () => new Response(JSON.stringify({
    error: { code: "provider_rate_limit", message: "Provider is busy." }
  }), {
    status: 429,
    headers: { "content-type": "application/json" }
  }));

  assert.equal(res.statusCode, 429);
  assert.equal(JSON.parse(res.body).error.type, "rate_limit_error");
});

test("Gemini generateContent aggregates the billed stream into JSON", async () => {
  appState.desktopAccountToken = "account-token";
  const res = responseStream();
  const stream = [
    'data: {"type":"response.output_text.delta","delta":"Done"}',
    'data: {"type":"response.completed","response":{"usage":{"input_tokens":3,"output_tokens":1}}}',
    ""
  ].join("\n\n");

  await proxyNativeTerminalProtocol(new EventEmitter(), res, {
    protocol: "gemini",
    billingModel: "google/gemini-3.5-flash",
    body: { contents: [] },
    streamResponse: false
  }, async () => new Response(stream, {
    status: 200,
    headers: { "content-type": "text/event-stream" }
  }));

  const payload = JSON.parse(res.body);
  assert.equal(res.statusCode, 200);
  assert.equal(payload.candidates[0].content.parts[0].text, "Done");
  assert.equal(payload.usageMetadata.totalTokenCount, 4);
});

test("native terminal requests use the same backend as desktop authentication", async () => {
  appState.desktopAccountToken = "account-token";
  const res = responseStream();
  let requestedUrl = "";

  await proxyNativeTerminalProtocol(new EventEmitter(), res, {
    protocol: "anthropic",
    billingModel: "anthropic/claude-haiku-4.5",
    body: { messages: [] }
  }, async (url) => {
    requestedUrl = url;
    return new Response([
      'data: {"type":"response.completed","response":{"usage":{"input_tokens":1,"output_tokens":1}}}',
      ""
    ].join("\n\n"), {
      status: 200,
      headers: { "content-type": "text/event-stream" }
    });
  });

  assert.equal(requestedUrl, `${desktopAppApiUrl()}/api/codex/responses`);
});

function billingLimitResponse(code = "billing_usage_cap") {
  return new Response(JSON.stringify({
    error: {
      message: "Your current AI usage window does not have enough capacity for this request.",
      code,
      details: { billingStatus: 429 }
    }
  }), {
    status: 400,
    headers: { "content-type": "application/json" }
  });
}

function responseStream() {
  const res = new PassThrough();
  res.body = "";
  res.on("data", (chunk) => { res.body += chunk.toString(); });
  res.writeHead = (statusCode, responseHeaders) => {
    res.statusCode = statusCode;
    res.responseHeaders = responseHeaders;
  };
  return res;
}
