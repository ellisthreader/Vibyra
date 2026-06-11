import { createHash } from "node:crypto";

export const TERMINAL_TEAM_PLAN_SCHEMA_VERSION = "vibyra.team-plan.v1";

const FALLBACK_REASONS = new Set([
  "no_proposal", "invalid_schema", "invalid_scope", "unsupported_output"
]);

export function alias(object, camel, snake) {
  if (camel === snake) return object[camel];
  if (Object.hasOwn(object, camel) && Object.hasOwn(object, snake)) {
    throw plannerError(`Use only one spelling for ${camel}.`);
  }
  return Object.hasOwn(object, camel) ? object[camel] : object[snake];
}

export function assertPlainObject(value, label, code = "invalid_schema") {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype) {
    throw plannerError(`${label} must be an object.`, code);
  }
}

export function rejectUnknownKeys(value, allowed, label, code = "invalid_schema") {
  const unknown = Object.keys(value).find((key) => !allowed.has(key));
  if (unknown) {
    throw plannerError(`${label} contains unsupported field "${unknown}".`, code);
  }
}

export function boundedText(value, limit, message) {
  const text = String(value ?? "")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!text || text.length > limit) throw plannerError(message);
  return text;
}

export function boundedStringArray(value, maximum, label) {
  if (!Array.isArray(value) || value.length > maximum) {
    throw plannerError(`${label} must be a bounded array.`);
  }
  return value.map((item) => boundedText(item, 1200, `Invalid ${label} item.`));
}

export function hashCanonical(value) {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

export function plannerError(message, code = "invalid_schema") {
  const error = new Error(message);
  error.status = 422;
  error.code = FALLBACK_REASONS.has(code) ? code : "invalid_schema";
  return error;
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}
