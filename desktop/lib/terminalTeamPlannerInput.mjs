import {
  assertPlainObject,
  boundedText,
  plannerError,
  rejectUnknownKeys
} from "./terminalTeamPlannerShared.mjs";

const PLANNER_MODES = new Set(["mini", "ollama", "provider"]);
const FALLBACK_REASONS = new Set([
  "planner_auth_required", "planner_timeout", "planner_unavailable",
  "planner_failed", "planner_insufficient_credits", "team_plan_provider_error",
  "planner_endpoint_unavailable", "invalid_team_plan"
]);
const SIGNAL_KEYS = new Set([
  "ambiguous", "crossLayer", "securityRisk", "migrationRisk", "billingRisk",
  "concurrencyRisk", "runtimeRisk", "validationHeavy"
]);

export function normalizeTerminalTeamInput(input) {
  assertPlainObject(input, "Team planning input");
  const goal = boundedText(input.goal, 1200, "A Team goal is required.");
  const requestedSize = input.teamSize == null || input.teamSize === ""
    ? 0
    : Number(input.teamSize);
  if (![0, 2, 3, 4].includes(requestedSize)) {
    throw plannerError("Team size must be Automatic, 2, 3, or 4.");
  }
  const signals = normalizeSignals(input.signals);
  const requestedMode = String(input.plannerMode || "").trim().toLowerCase();
  const plannerMode = PLANNER_MODES.has(requestedMode) ? requestedMode : "mini";
  const defaultModel = plannerMode === "ollama" ? "qwen3:4b-instruct" : "gpt-5.4-mini";
  const plannerModel = boundedText(input.plannerModel || defaultModel, 120,
    "A planner model is required.");
  const requestedFallback = String(input.fallbackReason || "").trim().toLowerCase();
  const fallbackReason = FALLBACK_REASONS.has(requestedFallback) ? requestedFallback : "";
  return { goal, requestedSize, signals, plannerMode, plannerModel, fallbackReason };
}

export function chooseTerminalTeamTopology(intent) {
  const { requestedSize, signals } = intent;
  const discovery = signals.ambiguous || signals.crossLayer;
  const verification = signals.securityRisk || signals.migrationRisk
    || signals.billingRisk || signals.concurrencyRisk || signals.runtimeRisk
    || signals.validationHeavy;
  const size = requestedSize
    || (discovery && verification ? 4 : discovery || verification ? 3 : 2);
  if (size === 2) return ["builder", "reviewer"];
  if (size === 4) return ["coordinator", "builder", "verifier", "reviewer"];
  if (discovery) return ["coordinator", "builder", "reviewer"];
  if (verification) return ["builder", "verifier", "reviewer"];
  return ["coordinator", "builder", "reviewer"];
}

export function inferTerminalTeamSignals(input = {}) {
  const text = String(input.goal || "").toLowerCase();
  const paths = Array.isArray(input.projectFiles)
    ? input.projectFiles.map((file) => String(file?.path || "")).filter(Boolean)
    : [];
  const topLevels = new Set(paths.map((path) => path.split("/")[0]).filter(Boolean));
  return {
    ambiguous: /\b(investigate|analy[sz]e|unknown|explore|diagnose|audit everything)\b/.test(text),
    crossLayer: topLevels.size > 1
      || /\b(frontend|renderer|desktop|backend|api|database|mobile)\b.*\b(frontend|renderer|desktop|backend|api|database|mobile)\b/.test(text),
    securityRisk: /\b(security|credential|secret|token|permission|auth|sandbox|vulnerab)\w*/.test(text),
    migrationRisk: /\b(migration|schema|database|backfill|rollback)\b/.test(text),
    billingRisk: /\b(billing|credit|payment|quota|charge)\w*/.test(text),
    concurrencyRisk: /\b(concurren|race|parallel|transaction|atomic|deadlock)\w*/.test(text),
    runtimeRisk: /\b(runtime|process|worker|pty|terminal|recovery|resume|shutdown|launch)\w*/.test(text),
    validationHeavy: /\b(exhaustive|every possibility|regression|compatib|end[- ]to[- ]end|all functions)\w*/.test(text)
  };
}

function normalizeSignals(value) {
  if (value == null) return Object.freeze({});
  assertPlainObject(value, "Team planning signals");
  rejectUnknownKeys(value, SIGNAL_KEYS, "Team planning signals");
  return Object.freeze(Object.fromEntries(
    [...SIGNAL_KEYS].map((key) => [key, value[key] === true])
  ));
}
