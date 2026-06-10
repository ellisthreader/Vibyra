import { headers } from "./http.mjs";
import { authenticatePhoneToken, tokenForApprovedPair } from "./deviceCredentials.mjs";
import { appState, machineName, TOKEN } from "./state.mjs";

export const PAIRING_BODY_LIMIT_BYTES = 4096;
export const PAIRING_PENDING_TTL_MS = 2 * 60 * 1000;
export const PAIRING_APPROVED_TTL_MS = 2 * 60 * 1000;

const rateBuckets = new Map();

export function isAuthed(req) {
  const authorization = String(req?.headers?.authorization || "");
  const token = authorization.toLowerCase().startsWith("bearer ")
    ? authorization.slice(7).trim()
    : "";
  return authenticatePhoneToken(token, {
    accountId: appState.desktopAccount?.id,
    legacyToken: TOKEN
  });
}

export function approvedPairPayload(pendingPair) {
  return {
    ok: true,
    status: "approved",
    token: tokenForApprovedPair(pendingPair, TOKEN),
    machineName,
    projects: appState.cachedProjects,
    events: appState.events
  };
}

export async function readPairingBody(req) {
  const body = await readLimitedJson(req, PAIRING_BODY_LIMIT_BYTES);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw pairingError(400, "Pairing request must be a JSON object");
  }

  const code = boundedString(body.code, "Pair code", 12).toUpperCase();
  const requestId = boundedString(body.requestId, "Pair request ID", 128);
  const deviceName = boundedString(body.deviceName ?? "Vibyra Phone", "Device name", 80);
  if (code && !/^[A-Z2-9]{4,12}$/.test(code)) {
    throw pairingError(400, "Pair code format is invalid");
  }
  if (requestId && !isValidPairRequestId(requestId)) {
    throw pairingError(400, "Pair request ID format is invalid");
  }
  if (body.autoPair !== undefined && typeof body.autoPair !== "boolean") {
    throw pairingError(400, "autoPair must be a boolean");
  }

  return {
    accountId: body.accountId,
    autoPair: body.autoPair === true,
    code,
    deviceName: deviceName || "Vibyra Phone",
    requestId
  };
}

export function expirePairingRequest(pendingPair, now = Date.now()) {
  if (!pendingPair || pendingPair.status === "denied" || pendingPair.status === "expired") {
    return pendingPair;
  }
  const timestamp = pendingPair.status === "approved"
    ? pendingPair.approvedAt ?? pendingPair.requestedAt
    : pendingPair.requestedAt;
  const ttl = pendingPair.status === "approved" ? PAIRING_APPROVED_TTL_MS : PAIRING_PENDING_TTL_MS;
  const createdAt = Date.parse(String(timestamp || ""));
  if (!Number.isFinite(createdAt) || now - createdAt <= ttl) return pendingPair;
  return { ...pendingPair, status: "expired", expiredAt: new Date(now).toISOString() };
}

export function checkPairingRateLimit(req, scope, requestId = "", now = Date.now()) {
  if (process.env.VIBYRA_PAIR_RATE_LIMIT_ENABLED === "false") return null;
  sweepRateBuckets(now);
  const rules = scope === "status"
    ? [
        [`status:ip:${clientAddress(req)}`, 360, 2 * 60 * 1000],
        requestId ? [`status:id:${requestId}`, 240, 2 * 60 * 1000] : null
      ]
    : [
        [`pair:ip:${clientAddress(req)}`, 60, 60 * 1000],
        requestId ? [`pair:id:${requestId}`, 12, 60 * 1000] : null
      ];

  for (const rule of rules) {
    if (!rule) continue;
    const result = consumeRateBucket(rule[0], rule[1], rule[2], now);
    if (!result.allowed) return result;
  }
  return null;
}

export function sendPairingRateLimit(res, result) {
  const retryAfter = Math.max(1, Math.ceil(result.retryAfterMs / 1000));
  res.writeHead(429, { ...headers(), "Retry-After": String(retryAfter) });
  res.end(JSON.stringify({
    ok: false,
    error: "Too many pairing requests. Try again shortly.",
    retryAfter
  }));
}

export function clearPairingRateLimitsForTests() {
  rateBuckets.clear();
}

export function isValidPairRequestId(value) {
  return /^[A-Za-z0-9._:-]{8,128}$/.test(String(value ?? ""));
}

function consumeRateBucket(key, limit, windowMs, now) {
  const current = rateBuckets.get(key);
  if (!current || now >= current.resetAt) {
    rateBuckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfterMs: 0 };
  }
  if (current.count >= limit) {
    return { allowed: false, retryAfterMs: current.resetAt - now };
  }
  current.count += 1;
  return { allowed: true, retryAfterMs: 0 };
}

function sweepRateBuckets(now) {
  if (rateBuckets.size < 1024) return;
  for (const [key, bucket] of rateBuckets) {
    if (now >= bucket.resetAt) rateBuckets.delete(key);
  }
  while (rateBuckets.size > 4096) {
    rateBuckets.delete(rateBuckets.keys().next().value);
  }
}

function clientAddress(req) {
  return String(req?.socket?.remoteAddress || req?.connection?.remoteAddress || "unknown")
    .replace(/^::ffff:/, "")
    .slice(0, 128);
}

function boundedString(value, label, maxLength) {
  const result = String(value ?? "").trim();
  if (result.length > maxLength) throw pairingError(400, `${label} is too long`);
  return result;
}

function readLimitedJson(req, limitBytes) {
  return new Promise((resolve, reject) => {
    let raw = "";
    let bytes = 0;
    let settled = false;

    const fail = (error) => {
      if (settled) return;
      settled = true;
      cleanup();
      req.resume?.();
      reject(error);
    };
    const onData = (chunk) => {
      bytes += Buffer.byteLength(chunk);
      if (bytes > limitBytes) {
        fail(pairingError(413, "Pairing request body is too large"));
        return;
      }
      raw += chunk;
    };
    const onEnd = () => {
      if (settled) return;
      settled = true;
      cleanup();
      if (!raw) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(pairingError(400, "Pairing request contains invalid JSON"));
      }
    };
    const onError = () => fail(pairingError(400, "Could not read pairing request"));
    const cleanup = () => {
      req.removeListener("data", onData);
      req.removeListener("end", onEnd);
      req.removeListener("error", onError);
    };

    req.on("data", onData);
    req.on("end", onEnd);
    req.on("error", onError);
  });
}

function pairingError(status, message) {
  return Object.assign(new Error(message), { status });
}
