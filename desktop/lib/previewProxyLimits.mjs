const DEFAULT_UPSTREAM_TIMEOUT_MS = 15_000;
const DEFAULT_MAX_CONCURRENCY = 16;
const DEFAULT_MAX_REQUEST_BODY_BYTES = 8 * 1024 * 1024;
const DEFAULT_MAX_RESPONSE_BODY_BYTES = 64 * 1024 * 1024;

let activeProxyRequests = 0;

export function previewProxyLimits(env = process.env) {
  return {
    maxConcurrency: positiveInteger(
      env.VIBYRA_PREVIEW_PROXY_MAX_CONCURRENCY,
      DEFAULT_MAX_CONCURRENCY
    ),
    maxRequestBodyBytes: positiveInteger(
      env.VIBYRA_PREVIEW_PROXY_MAX_REQUEST_BODY_BYTES,
      DEFAULT_MAX_REQUEST_BODY_BYTES
    ),
    maxResponseBodyBytes: positiveInteger(
      env.VIBYRA_PREVIEW_PROXY_MAX_RESPONSE_BODY_BYTES,
      DEFAULT_MAX_RESPONSE_BODY_BYTES
    ),
    upstreamTimeoutMs: positiveInteger(
      env.VIBYRA_PREVIEW_PROXY_UPSTREAM_TIMEOUT_MS,
      DEFAULT_UPSTREAM_TIMEOUT_MS
    )
  };
}

export function acquirePreviewProxySlot(maxConcurrency) {
  if (activeProxyRequests >= maxConcurrency) return null;
  activeProxyRequests += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    activeProxyRequests = Math.max(0, activeProxyRequests - 1);
  };
}

export function proxyLimitError(message, status = 502, code = "PREVIEW_PROXY_LIMIT") {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  return error;
}

export function envFlagEnabled(name, fallback = false, env = process.env) {
  const raw = String(env[name] ?? "").trim().toLowerCase();
  if (!raw) return fallback;
  return ["1", "true", "yes", "on"].includes(raw);
}

function positiveInteger(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}
