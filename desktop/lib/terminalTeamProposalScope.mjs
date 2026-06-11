import {
  assertPlainObject,
  boundedText,
  plannerError,
  rejectUnknownKeys
} from "./terminalTeamPlannerShared.mjs";

const SCOPE_KEYS = new Set(["kind", "path"]);
const VALIDATION_KEYS = new Set(["kind", "target"]);
const VALIDATION_KINDS = new Set([
  "inspect", "reproduce", "test", "lint", "typecheck", "build"
]);
const FORBIDDEN_PATH_SEGMENTS = new Set([
  ".git", ".vibyra-agent", "node_modules", "vendor", ".env",
  ".ssh", ".aws", ".config"
]);

export function validateProposalScope(values, mustBeEmpty) {
  if (!Array.isArray(values) || values.length > 24) {
    throw plannerError("Team assignment scope must be a bounded array.", "invalid_scope");
  }
  if (mustBeEmpty && values.length) {
    throw plannerError("Only the Builder may receive write scope.", "invalid_scope");
  }
  const seen = new Set();
  const normalized = values.map((value) => {
    assertPlainObject(value, "Scope entry", "invalid_scope");
    rejectUnknownKeys(value, SCOPE_KEYS, "Scope entry", "invalid_scope");
    if (!["file", "directory"].includes(value.kind)) {
      throw plannerError("Scope kind must be file or directory.", "invalid_scope");
    }
    const path = safeRelativePath(value.path);
    const key = `${value.kind}:${path.toLowerCase()}`;
    if (seen.has(key)) {
      throw plannerError("Team assignment scope contains a duplicate path.", "invalid_scope");
    }
    seen.add(key);
    return { kind: value.kind, path };
  });
  rejectOverlappingScope(normalized);
  return normalized;
}

export function validateProposalIntents(values) {
  if (!Array.isArray(values) || values.length > 12) {
    throw plannerError("Validation intents must be a bounded array.");
  }
  return values.map((value) => {
    assertPlainObject(value, "Validation intent");
    rejectUnknownKeys(value, VALIDATION_KEYS, "Validation intent");
    if (!VALIDATION_KINDS.has(value.kind)) {
      throw plannerError("Validation intent kind is invalid.");
    }
    return {
      kind: value.kind,
      target: boundedText(value.target, 1200, "Validation target is required.")
    };
  });
}

export function assertProposalBounds(proposal) {
  let serialized = "";
  try {
    serialized = JSON.stringify(proposal);
  } catch {
    throw plannerError("Team planner proposal is not serializable.");
  }
  if (Buffer.byteLength(serialized, "utf8") > 64 * 1024) {
    throw plannerError("Team planner proposal exceeds the byte limit.");
  }
  visitDepth(proposal, 1);
}

function safeRelativePath(value) {
  const raw = String(value || "").normalize("NFC").replaceAll("\\", "/").trim();
  let decoded = raw;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    throw plannerError("Scope path encoding is invalid.", "invalid_scope");
  }
  if (decoded !== raw) {
    throw plannerError("Encoded Team scope paths are not allowed.", "invalid_scope");
  }
  const segments = decoded.split("/");
  const sensitive = (part) =>
    /credential|private.?key|^id_(?:rsa|dsa|ecdsa|ed25519)$|^\.(?:npmrc|netrc)$|\.pem$/i
      .test(part);
  if (!raw || raw.startsWith("/") || /^[a-z]:\//i.test(raw) || raw.includes("\0")
    || segments.some((part) => !part || part === "." || part === "..")
    || segments.some((part) => FORBIDDEN_PATH_SEGMENTS.has(part.toLowerCase()))
    || segments.some((part) => /^\.env(?:\.|$)/i.test(part) || sensitive(part))) {
    throw plannerError("Scope path is unsafe.", "invalid_scope");
  }
  return raw;
}

function rejectOverlappingScope(scope) {
  for (let left = 0; left < scope.length; left += 1) {
    for (let right = left + 1; right < scope.length; right += 1) {
      const first = scope[left].path.toLowerCase();
      const second = scope[right].path.toLowerCase();
      if (first === second || first.startsWith(`${second}/`)
        || second.startsWith(`${first}/`)) {
        throw plannerError("Team assignment scope paths overlap.", "invalid_scope");
      }
    }
  }
}

function visitDepth(value, depth) {
  if (depth > 8) throw plannerError("Team planner proposal exceeds the depth limit.");
  if (!value || typeof value !== "object") return;
  for (const child of Object.values(value)) visitDepth(child, depth + 1);
}
