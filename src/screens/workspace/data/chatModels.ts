import { ANALYZE_FILES_MODEL_KEY, DEEP_RESEARCH_MODEL_KEY, WEB_SEARCH_MODEL_KEY } from "../../../types/chatTools";
import { ChatModelOption } from "../types";

export type ModelTier = "free" | "budget" | "balanced" | "premium";

// Mirrors backend/config/billing.php "models" tier assignment.
export const modelTiers: Record<string, ModelTier> = {
  auto: "budget",
  "gpt-5.5": "premium",
  "gpt-5.4": "balanced",
  "gpt-5.4-mini": "budget",
  "gpt-5.4-nano": "budget",
  "gpt-5-codex": "premium",
  "tool-deep-research": "budget",
  "tool-web-search": "budget",
  "tool-analyze-files": "budget",
  "claude-opus-4": "premium",
  "claude-sonnet-4": "balanced",
  "claude-3-5-haiku": "budget",
  "gemini-2.5-pro": "premium",
  "gemini-2.5-flash": "budget",
  "gemini-2.0-flash": "budget"
};

export const chatModelGroups: Array<{ title: string; options: ChatModelOption[] }> = [
  {
    title: "",
    options: [{ key: "auto", label: "Auto", provider: "auto" }]
  },
  {
    title: "Claude Models",
    options: [
      { badge: "New", key: "claude-opus-4", label: "Claude Opus 4", provider: "claude" },
      { key: "claude-sonnet-4", label: "Claude Sonnet 4", provider: "claude" },
      { key: "claude-3-5-haiku", label: "Claude Haiku 3.5", provider: "claude" }
    ]
  },
  {
    title: "OpenAI models",
    options: [
      { badge: "New", key: "gpt-5.5", label: "GPT-5.5", provider: "openai", modelKey: "gpt-5.5" },
      { key: "gpt-5.4", label: "GPT-5.4", provider: "openai", modelKey: "gpt-5.4" },
      { key: "gpt-5.4-mini", label: "GPT-5.4 Mini", provider: "openai", modelKey: "gpt-5.4-mini" },
      { key: "gpt-5-codex", label: "GPT-5 Codex", provider: "openai", modelKey: "gpt-5-codex" }
    ]
  },
  {
    title: "Gemini Models",
    options: [
      { badge: "New", key: "gemini-2.5-pro", label: "Gemini 2.5 Pro", provider: "gemini" },
      { key: "gemini-2.5-flash", label: "Gemini 2.5 Flash", provider: "gemini" },
      { key: "gemini-2.0-flash", label: "Gemini 2.0 Flash", provider: "gemini" }
    ]
  }
];

export const planAllowedTiers: Record<string, ModelTier[]> = {
  free: ["free", "budget"],
  starter: ["free", "budget", "balanced", "premium"],
  builder: ["free", "budget", "balanced", "premium"],
  pro: ["free", "budget", "balanced", "premium"]
};

export function modelTierFor(model: ChatModelOption): ModelTier {
  return modelTiers[model.modelKey ?? model.key] ?? "balanced";
}

export function modelLockedForTiers(model: ChatModelOption, allowedTiers: ModelTier[] | string[] | undefined): boolean {
  const tier = modelTierFor(model);
  const allowed = (allowedTiers && allowedTiers.length > 0)
    ? (allowedTiers as ModelTier[])
    : planAllowedTiers.free;
  return !allowed.includes(tier);
}

export const chatModelOptions = chatModelGroups.flatMap((group) => group.options);

export const toolOnlyChatModelOptions: ChatModelOption[] = [
  { key: DEEP_RESEARCH_MODEL_KEY, label: "Deep Research", provider: "gemini" },
  { key: WEB_SEARCH_MODEL_KEY, label: "Agent Web Search", provider: "gemini" },
  { key: ANALYZE_FILES_MODEL_KEY, label: "Analyze Files", provider: "gemini" }
];

export const chatModelLookupOptions = [...chatModelOptions, ...toolOnlyChatModelOptions];

export function chatModelOptionFor(key: string | null | undefined): ChatModelOption | undefined {
  if (!key) return undefined;
  return chatModelLookupOptions.find((model) => model.key === key || model.modelKey === key);
}

export const providerLogoSources = {
  gemini: "https://upload.wikimedia.org/wikipedia/commons/thumb/1/1d/Google_Gemini_icon_2025.svg/250px-Google_Gemini_icon_2025.svg.png",
  openai: "https://upload.wikimedia.org/wikipedia/commons/thumb/6/66/OpenAI_logo_2025_%28symbol%29.svg/250px-OpenAI_logo_2025_%28symbol%29.svg.png"
};
