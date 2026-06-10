import { randomBytes } from "node:crypto";

import {
  decryptRpcEnvelope,
  encryptRpcEnvelope,
  LAN_V2_PROTOCOL,
  ReplayWindow
} from "./lanV2Protocol.mjs";

export const LAN_V2_SESSION_IDLE_MS = 5 * 60 * 1000;
export const LAN_V2_SESSION_ABSOLUTE_MS = 30 * 60 * 1000;

export function createLanV2SessionStore({
  now = () => Date.now(),
  randomBytesImpl = randomBytes,
  idleMs = LAN_V2_SESSION_IDLE_MS,
  absoluteMs = LAN_V2_SESSION_ABSOLUTE_MS
} = {}) {
  const sessions = new Map();

  function establish(input) {
    sweep();
    const createdAt = now();
    const sessionId = `v2s.${randomBytesImpl(24).toString("base64url")}`;
    const session = {
      sessionId,
      protocol: LAN_V2_PROTOCOL,
      accountId: requiredString(input.accountId, "accountId"),
      credentialId: requiredString(input.credentialId, "credentialId"),
      phoneDeviceId: requiredString(input.phoneDeviceId, "phoneDeviceId"),
      scopes: normalizeScopes(input.scopes),
      receiveKey: normalizeKey(input.receiveKey),
      sendKey: normalizeKey(input.sendKey),
      receiveWindow: new ReplayWindow(),
      sendSequence: 0,
      createdAt,
      lastUsedAt: createdAt,
      idleExpiresAt: createdAt + idleMs,
      absoluteExpiresAt: createdAt + absoluteMs,
      revokedAt: null
    };
    sessions.set(sessionId, session);
    return publicSession(session);
  }

  function decryptRequest(envelope) {
    const session = activeSession(envelope?.sessionId);
    const decrypted = decryptRpcEnvelope(envelope, session.receiveKey);
    session.receiveWindow.accept(decrypted.metadata.sequence);
    touch(session);
    return {
      ...decrypted,
      principal: principal(session)
    };
  }

  function encryptResponse(sessionId, {
    route,
    requestId,
    idempotencyKey = "",
    payload
  }) {
    const session = activeSession(sessionId);
    session.sendSequence += 1;
    touch(session);
    return encryptRpcEnvelope({
      key: session.sendKey,
      sessionId,
      route,
      requestId,
      sequence: session.sendSequence,
      idempotencyKey,
      timestamp: new Date(now()).toISOString(),
      payload,
      randomBytesImpl
    });
  }

  function revoke(sessionId) {
    const session = sessions.get(String(sessionId || ""));
    if (!session || session.revokedAt) return false;
    session.revokedAt = now();
    zeroKeys(session);
    return true;
  }

  function revokeCredential(credentialId) {
    let revoked = 0;
    for (const session of sessions.values()) {
      if (session.credentialId === String(credentialId) && !session.revokedAt) {
        session.revokedAt = now();
        zeroKeys(session);
        revoked += 1;
      }
    }
    return revoked;
  }

  function sweep() {
    const current = now();
    for (const [sessionId, session] of sessions) {
      if (session.revokedAt || isExpired(session, current)) {
        zeroKeys(session);
        sessions.delete(sessionId);
      }
    }
  }

  function activeSession(sessionId) {
    const session = sessions.get(requiredString(sessionId, "sessionId"));
    if (!session || session.revokedAt) throw sessionError("LAN_V2_SESSION_INVALID", "LAN V2 session is invalid");
    if (isExpired(session, now())) {
      zeroKeys(session);
      sessions.delete(session.sessionId);
      throw sessionError("LAN_V2_SESSION_EXPIRED", "LAN V2 session expired");
    }
    return session;
  }

  function touch(session) {
    session.lastUsedAt = now();
    session.idleExpiresAt = Math.min(session.lastUsedAt + idleMs, session.absoluteExpiresAt);
  }

  return {
    decryptRequest,
    encryptResponse,
    establish,
    get: (sessionId) => {
      const session = sessions.get(String(sessionId || ""));
      return session && !session.revokedAt ? publicSession(session) : null;
    },
    revoke,
    revokeCredential,
    size: () => sessions.size,
    sweep
  };
}

function publicSession(session) {
  return {
    sessionId: session.sessionId,
    protocol: session.protocol,
    principal: principal(session),
    createdAt: new Date(session.createdAt).toISOString(),
    idleExpiresAt: new Date(session.idleExpiresAt).toISOString(),
    absoluteExpiresAt: new Date(session.absoluteExpiresAt).toISOString()
  };
}

function principal(session) {
  return {
    accountId: session.accountId,
    credentialId: session.credentialId,
    phoneDeviceId: session.phoneDeviceId,
    scopes: [...session.scopes]
  };
}

function normalizeScopes(scopes) {
  const values = Array.isArray(scopes) ? scopes : ["desktop:rpc"];
  const normalized = Array.from(new Set(values.map((value) => String(value || "").trim()).filter(Boolean)));
  if (!normalized.length || normalized.some((scope) => scope.length > 80)) {
    throw new Error("LAN V2 scopes are invalid");
  }
  return normalized.sort();
}

function normalizeKey(value) {
  const key = Buffer.isBuffer(value) ? Buffer.from(value) : Buffer.from(value || []);
  if (key.length !== 32) throw new Error("LAN V2 session key must be 32 bytes");
  return key;
}

function requiredString(value, label) {
  const result = String(value || "").trim();
  if (!result || result.length > 160) throw new Error(`LAN V2 ${label} is invalid`);
  return result;
}

function isExpired(session, current) {
  return current >= session.idleExpiresAt || current >= session.absoluteExpiresAt;
}

function zeroKeys(session) {
  session.receiveKey?.fill(0);
  session.sendKey?.fill(0);
}

function sessionError(code, message) {
  return Object.assign(new Error(message), { code });
}
