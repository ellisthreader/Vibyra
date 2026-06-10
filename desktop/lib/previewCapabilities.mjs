import { randomBytes } from "node:crypto";

const previewCapabilities = new Map();
const PREVIEW_CAPABILITY_TTL_MS = 4 * 60 * 60 * 1000;

export function issuePreviewCapability(projectId, options = {}) {
  const now = options.now ?? Date.now();
  prunePreviewCapabilities(now);
  const token = `preview-${randomBytes(24).toString("base64url")}`;
  previewCapabilities.set(token, {
    expiresAt: now + (options.ttlMs ?? PREVIEW_CAPABILITY_TTL_MS),
    projectId: String(projectId || ""),
    targetId: String(options.targetId || "")
  });
  return token;
}

export function replacePreviewCapability(projectId, previousToken, options = {}) {
  revokePreviewCapability(previousToken);
  return issuePreviewCapability(projectId, options);
}

export function previewCredentialAllowsProject(token, projectId, options = {}) {
  const credential = String(token || "");
  if (
    credential
    && credential === String(options.legacyToken || "")
    && legacyPreviewTokenEnabled(options.env)
  ) return true;
  const capability = previewCapability(credential, options.now);
  return Boolean(capability && capability.projectId === String(projectId || ""));
}

export function previewCredentialProjectId(token, options = {}) {
  if (
    String(token || "") === String(options.legacyToken || "")
    && legacyPreviewTokenEnabled(options.env)
  ) return "";
  return previewCapability(token, options.now)?.projectId || "";
}

export function previewCredentialTargetId(token, options = {}) {
  if (
    String(token || "") === String(options.legacyToken || "")
    && legacyPreviewTokenEnabled(options.env)
  ) return "";
  return previewCapability(token, options.now)?.targetId || "";
}

export function legacyPreviewTokenEnabled(env = process.env) {
  const raw = String(env.VIBYRA_LEGACY_PREVIEW_TOKEN_ENABLED ?? "").trim().toLowerCase();
  if (!raw) return true;
  return ["1", "true", "yes", "on"].includes(raw);
}

export function revokePreviewCapability(token) {
  return previewCapabilities.delete(String(token || ""));
}

export function revokePreviewCapabilitiesForProject(projectId) {
  const targetProjectId = String(projectId || "");
  let revoked = 0;
  for (const [token, capability] of previewCapabilities) {
    if (capability.projectId !== targetProjectId) continue;
    previewCapabilities.delete(token);
    revoked += 1;
  }
  return revoked;
}

export function revokeAllPreviewCapabilities() {
  const revoked = previewCapabilities.size;
  previewCapabilities.clear();
  return revoked;
}

function previewCapability(token, now = Date.now()) {
  const capability = previewCapabilities.get(String(token || ""));
  if (!capability) return null;
  if (capability.expiresAt > now) return capability;
  previewCapabilities.delete(String(token || ""));
  return null;
}

function prunePreviewCapabilities(now = Date.now()) {
  for (const [token, capability] of previewCapabilities) {
    if (capability.expiresAt <= now) previewCapabilities.delete(token);
  }
}
