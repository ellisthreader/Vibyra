import type { CatalogModel } from "./openRouterCatalog";
import type { LaunchEffort } from "../state/launchSettingsStore";

export interface EffortOption {
  value: LaunchEffort;
  label: string;
  hint: string;
}

const OPTION: Record<LaunchEffort, EffortOption> = {
  none: { value: "none", label: "None", hint: "Reasoning off" },
  minimal: { value: "minimal", label: "Minimal", hint: "Quick reasoning" },
  low: { value: "low", label: "Low", hint: "Fastest" },
  medium: { value: "medium", label: "Medium", hint: "Balanced" },
  high: { value: "high", label: "High", hint: "Deep reasoning" },
  xhigh: { value: "xhigh", label: "X-high", hint: "Long agentic coding" },
  max: { value: "max", label: "Max", hint: "Deepest single task" },
  ultra: { value: "ultra", label: "Ultra", hint: "Automatic delegation" },
  ultracode: { value: "ultracode", label: "Ultra code", hint: "X-high + workflows" },
};

function options(...values: LaunchEffort[]): EffortOption[] {
  return values.map((value) => OPTION[value]);
}

const BASIC = options("low", "medium", "high");
const XHIGH = options("low", "medium", "high", "xhigh");
const MAX = options("low", "medium", "high", "max");
const FULL = options("low", "medium", "high", "xhigh", "max");
const CODEX_ULTRA = options("low", "medium", "high", "xhigh", "max", "ultra");

function modelKey(model: CatalogModel): string {
  return model.id.toLowerCase().replace(/^(?:openai|anthropic)\//, "").replace(/\./g, "-");
}

function startsWithAny(value: string, prefixes: string[]): boolean {
  return prefixes.some((prefix) => value === prefix || value.startsWith(`${prefix}-`));
}

function openRouterOptions(model: CatalogModel): EffortOption[] {
  return options(...model.reasoningEfforts);
}

function withClaudeUltraCode(available: EffortOption[]): EffortOption[] {
  return available.some(({ value }) => value === "xhigh")
    ? [...available, OPTION.ultracode]
    : available;
}

/** Exact values accepted by the selected launch runner for this model. */
export function modelEffortOptions(model: CatalogModel, runnerId: string): EffortOption[] {
  const key = modelKey(model);
  if (runnerId === "codex" && model.company === "OpenAI") {
    if (["gpt-5-6", "gpt-5-6-sol", "gpt-5-6-terra"].includes(key)) return CODEX_ULTRA;
    if (key === "gpt-5-6-luna") return FULL;
    if (["gpt-5-5", "gpt-5-4", "gpt-5-4-mini", "gpt-5-codex"].includes(key)) return XHIGH;
    return [];
  }
  if (runnerId !== "claude" || model.company !== "Anthropic") return [];
  const routerOptions = openRouterOptions(model);
  if (routerOptions.length > 0) return withClaudeUltraCode(routerOptions);
  if (startsWithAny(key, [
    "claude-fable-5", "claude-mythos-5", "claude-opus-5",
    "claude-opus-4-8", "claude-opus-4-7", "claude-sonnet-5",
  ])) return withClaudeUltraCode(FULL);
  if (startsWithAny(key, ["claude-mythos-preview", "claude-opus-4-6", "claude-sonnet-4-6"])) {
    return MAX;
  }
  if (startsWithAny(key, ["claude-opus-4-5"])) return BASIC;
  return [];
}

export function resolvedModelEffort(
  model: CatalogModel,
  runnerId: string,
  current: LaunchEffort,
): LaunchEffort | null {
  const supported = modelEffortOptions(model, runnerId);
  if (supported.some(({ value }) => value === current)) return current;
  const preferred: LaunchEffort = model.defaultReasoningEffort
    ?? (runnerId === "claude" ? "high" : modelKey(model) === "gpt-5-6-sol" ? "low" : "medium");
  return supported.find(({ value }) => value === preferred)?.value ?? supported[0]?.value ?? null;
}
