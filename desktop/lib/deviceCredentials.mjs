import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

const issuedPairTokens = new Map();
export const DEVICE_CREDENTIAL_TTL_MS = 90 * 24 * 60 * 60 * 1000;
export const DEFAULT_DEVICE_SCOPES = Object.freeze(["desktop:rpc", "preview"]);

export function createDeviceCredentialStore({
  filePath = defaultDeviceCredentialsPath(),
  now = () => new Date(),
  randomBytesImpl = randomBytes,
  lastUsedWriteIntervalMs = 60_000
} = {}) {
  function issue({
    accountId,
    deviceName,
    phoneDeviceId = "",
    scopes = DEFAULT_DEVICE_SCOPES,
    minimumProtocol = 1,
    rotatedFrom = null
  }) {
    const credentialId = randomBytesImpl(16).toString("base64url");
    const secret = randomBytesImpl(32).toString("base64url");
    const token = `vdc1.${credentialId}.${secret}`;
    const credentials = readCredentials(filePath);
    credentials.push(newCredentialRecord({
      credentialId,
      secret,
      accountId,
      deviceName,
      phoneDeviceId,
      scopes,
      minimumProtocol,
      rotatedFrom,
      now: now()
    }));
    writeCredentials(filePath, credentials);
    return { credentialId, token };
  }

  function rotate(credentialId) {
    const credentials = readCredentials(filePath);
    const credential = credentials.find((item) => item.credentialId === String(credentialId || ""));
    if (!credential || credential.revokedAt || isExpired(credential, now())) return null;
    const rotatedAt = now();
    const replacementId = randomBytesImpl(16).toString("base64url");
    const secret = randomBytesImpl(32).toString("base64url");
    credential.rotatedAt = rotatedAt.toISOString();
    credential.revokedAt = rotatedAt.toISOString();
    credential.revocationReason = "rotated";
    credential.revocationGeneration = Number(credential.revocationGeneration || 0) + 1;
    credentials.push(newCredentialRecord({
      credentialId: replacementId,
      secret,
      accountId: credential.accountId,
      deviceName: credential.deviceName,
      phoneDeviceId: credential.phoneDeviceId,
      scopes: credential.scopes,
      minimumProtocol: credential.minimumProtocol,
      rotatedFrom: credential.credentialId,
      now: rotatedAt
    }));
    writeCredentials(filePath, credentials);
    return {
      credentialId: replacementId,
      token: `vdc1.${replacementId}.${secret}`,
      rotatedFrom: credential.credentialId
    };
  }

  function updateMinimumProtocol(credentialId, protocol) {
    const minimumProtocol = normalizeProtocol(protocol);
    const credentials = readCredentials(filePath);
    const credential = credentials.find((item) => item.credentialId === String(credentialId || ""));
    if (!credential || credential.revokedAt) return false;
    credential.minimumProtocol = Math.max(Number(credential.minimumProtocol || 1), minimumProtocol);
    writeCredentials(filePath, credentials);
    return true;
  }

  function revoke(credentialId, reason = "removed") {
    const credentials = readCredentials(filePath);
    const credential = credentials.find((item) => item.credentialId === String(credentialId || ""));
    if (!credential || credential.revokedAt) return false;
    credential.revokedAt = now().toISOString();
    credential.revocationReason = normalizeRevocationReason(reason);
    credential.revocationGeneration = Number(credential.revocationGeneration || 0) + 1;
    writeCredentials(filePath, credentials);
    return true;
  }

  function authenticate(token, {
    accountId,
    touch = true,
    protocol = 1
  } = {}) {
    const parsed = parseDeviceCredential(token);
    if (!parsed) return null;
    const credentials = readCredentials(filePath);
    const credential = credentials.find((item) => item.credentialId === parsed.credentialId);
    if (!credential || credential.revokedAt || String(credential.accountId) !== String(accountId)) return null;
    if (isExpired(credential, now())) return null;
    if (normalizeProtocol(protocol) < Number(credential.minimumProtocol || 1)) return null;
    if (!safeHashEqual(credential.secretHash, sha256(parsed.secret))) return null;
    const authenticatedAt = now();
    if (touch && shouldPersistLastUsedAt(credential.lastUsedAt, authenticatedAt, lastUsedWriteIntervalMs)) {
      credential.lastUsedAt = authenticatedAt.toISOString();
      writeCredentials(filePath, credentials);
    }
    return { ...credential, scopes: normalizeScopes(credential.scopes) };
  }

  return {
    authenticate,
    filePath,
    issue,
    list: () => readCredentials(filePath).map((credential) => ({
      ...credential,
      scopes: normalizeScopes(credential.scopes)
    })),
    revoke,
    rotate,
    updateMinimumProtocol
  };
}

function newCredentialRecord({
  credentialId,
  secret,
  accountId,
  deviceName,
  phoneDeviceId,
  scopes,
  minimumProtocol,
  rotatedFrom,
  now
}) {
  return {
      credentialId,
      secretHash: sha256(secret),
      accountId,
      phoneDeviceId: String(phoneDeviceId || credentialId),
      deviceName: String(deviceName || "Vibyra Phone"),
      scopes: normalizeScopes(scopes),
      minimumProtocol: normalizeProtocol(minimumProtocol),
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + DEVICE_CREDENTIAL_TTL_MS).toISOString(),
      lastUsedAt: null,
      rotatedAt: null,
      rotatedFrom: rotatedFrom ? String(rotatedFrom) : null,
      revokedAt: null,
      revocationReason: null,
      revocationGeneration: 0
  };
}

export function issueDeviceCredential(input) {
  return createDeviceCredentialStore().issue(input);
}

export function authenticateDeviceCredential(token, options) {
  return createDeviceCredentialStore().authenticate(token, options);
}

export function revokeDeviceCredential(credentialId) {
  return createDeviceCredentialStore().revoke(credentialId);
}

export function rotateDeviceCredential(credentialId) {
  return createDeviceCredentialStore().rotate(credentialId);
}

export function setDeviceCredentialMinimumProtocol(credentialId, protocol) {
  return createDeviceCredentialStore().updateMinimumProtocol(credentialId, protocol);
}

export function authenticatePhoneToken(token, { accountId, legacyToken }) {
  if (!token) return false;
  if (envFlag("VIBYRA_LEGACY_PHONE_TOKEN_ENABLED", true) && token === legacyToken) return true;
  if (!envFlag("VIBYRA_DEVICE_CREDENTIALS_ENABLED", true)) return false;
  return Boolean(authenticateDeviceCredential(token, { accountId }));
}

export function tokenForApprovedPair(pendingPair, legacyToken) {
  if (!envFlag("VIBYRA_DEVICE_CREDENTIALS_ENABLED", true)) return legacyToken;
  const key = [
    pendingPair.id,
    pendingPair.accountId,
    pendingPair.deviceName,
    pendingPair.requestedAt
  ].join(":");
  let token = issuedPairTokens.get(key);
  if (!token) {
    token = issueDeviceCredential({
      accountId: pendingPair.accountId,
      deviceName: pendingPair.deviceName
    }).token;
    issuedPairTokens.set(key, token);
  }
  return token;
}

export function clearPairingCredentialIssuancesForTests() {
  issuedPairTokens.clear();
}

export function defaultDeviceCredentialsPath() {
  return process.env.VIBYRA_DEVICE_CREDENTIALS_PATH
    || join(process.env.VIBYRA_AGENT_HOME || homedir(), ".vibyra-agent", "device-credentials.json");
}

function parseDeviceCredential(token) {
  const match = String(token || "").match(/^vdc1\.([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)$/);
  return match ? { credentialId: match[1], secret: match[2] } : null;
}

function readCredentials(filePath) {
  try {
    if (!existsSync(filePath)) return [];
    const parsed = JSON.parse(readFileSync(filePath, "utf8"));
    return Array.isArray(parsed?.credentials) ? parsed.credentials : [];
  } catch {
    return [];
  }
}

function writeCredentials(filePath, credentials) {
  mkdirSync(dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  writeFileSync(temporaryPath, `${JSON.stringify({ version: 1, credentials }, null, 2)}\n`, { mode: 0o600 });
  renameSync(temporaryPath, filePath);
  chmodSync(filePath, 0o600);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function safeHashEqual(left, right) {
  const leftBuffer = Buffer.from(String(left || ""), "hex");
  const rightBuffer = Buffer.from(String(right || ""), "hex");
  return leftBuffer.length === rightBuffer.length && leftBuffer.length > 0 && timingSafeEqual(leftBuffer, rightBuffer);
}

function shouldPersistLastUsedAt(lastUsedAt, now, intervalMs) {
  const previous = Date.parse(String(lastUsedAt || ""));
  return !Number.isFinite(previous) || now.getTime() - previous >= intervalMs;
}

function isExpired(credential, now) {
  const expiresAt = Date.parse(String(credential.expiresAt || ""));
  return Number.isFinite(expiresAt) && now.getTime() >= expiresAt;
}

function normalizeScopes(scopes) {
  const values = Array.isArray(scopes) ? scopes : DEFAULT_DEVICE_SCOPES;
  const normalized = Array.from(new Set(values.map((scope) => String(scope || "").trim()).filter(Boolean)));
  if (!normalized.length || normalized.some((scope) => scope.length > 80)) {
    throw new Error("Device credential scopes are invalid");
  }
  return normalized.sort();
}

function normalizeProtocol(protocol) {
  const value = Number(protocol);
  if (!Number.isSafeInteger(value) || value < 1 || value > 100) {
    throw new Error("Device credential protocol is invalid");
  }
  return value;
}

function normalizeRevocationReason(reason) {
  const value = String(reason || "removed").trim();
  return value && value.length <= 80 ? value : "removed";
}

function envFlag(name, fallback) {
  const value = process.env[name];
  if (value === undefined || value === "") return fallback;
  return !["0", "false", "no", "off"].includes(String(value).trim().toLowerCase());
}
