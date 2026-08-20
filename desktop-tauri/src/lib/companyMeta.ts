// The 28 featured companies from the old app, in its display order, each
// mapped to its 64px pixel-logo key and plate accent.

export interface CompanyMeta {
  company: string;
  providerKey: string;
  accent: string;
}

const FEATURED_COMPANIES: CompanyMeta[] = [
  { company: "OpenAI", providerKey: "openai", accent: "#9ca8b4" },
  { company: "Anthropic", providerKey: "anthropic", accent: "#ff9b6a" },
  { company: "Google", providerKey: "google", accent: "#6aa8ff" },
  { company: "xAI", providerKey: "xai", accent: "#b9c0cc" },
  { company: "DeepSeek", providerKey: "deepseek", accent: "#4d6bfe" },
  { company: "Qwen", providerKey: "qwen", accent: "#bd8cff" },
  { company: "Mistral", providerKey: "mistral", accent: "#ff8a3c" },
  { company: "Meta", providerKey: "meta", accent: "#4a7dff" },
  { company: "Microsoft", providerKey: "microsoft", accent: "#6aa8ff" },
  { company: "Cohere", providerKey: "cohere", accent: "#c084fc" },
  { company: "Perplexity", providerKey: "perplexity", accent: "#3ec8dc" },
  { company: "Moonshot AI", providerKey: "moonshot", accent: "#69d6c7" },
  { company: "Z.AI", providerKey: "zhipu", accent: "#5b7cfa" },
  { company: "Amazon", providerKey: "amazon", accent: "#f0a63a" },
  { company: "AI21", providerKey: "ai21", accent: "#f472b6" },
  { company: "IBM", providerKey: "ibm", accent: "#6aa8ff" },
  { company: "NVIDIA", providerKey: "nvidia", accent: "#7ac142" },
  { company: "MiniMax", providerKey: "minimax", accent: "#f472b6" },
  { company: "Tencent", providerKey: "tencent", accent: "#38a8ff" },
  { company: "Baidu", providerKey: "baidu", accent: "#4e6ef2" },
  { company: "ByteDance", providerKey: "bytedance", accent: "#38d0da" },
  { company: "Xiaomi", providerKey: "xiaomi", accent: "#ff8a3c" },
  { company: "Groq", providerKey: "groq", accent: "#ff6b57" },
  { company: "Together AI", providerKey: "together", accent: "#5b7cfa" },
  { company: "Fireworks", providerKey: "fireworks", accent: "#bd8cff" },
  { company: "Liquid AI", providerKey: "liquid", accent: "#57c4f5" },
  { company: "Nous Research", providerKey: "nous", accent: "#c9a2f8" },
  { company: "OpenRouter", providerKey: "openrouter", accent: "#94a3b8" },
];

export const COMPANY_PRIORITY = new Map(FEATURED_COMPANIES.map((m, i) => [m.company, i]));
export const COMPANY_META = new Map(FEATURED_COMPANIES.map((m) => [m.company, m]));

const ALIASES: Array<[string[], string]> = [
  [["anthropic", "claude"], "Anthropic"],
  [["google", "google ai studio", "gemini"], "Google"],
  [["openai"], "OpenAI"],
  [["x-ai", "xai", "spacexai"], "xAI"],
  [["mistralai", "mistral ai"], "Mistral"],
  [["meta-llama", "meta"], "Meta"],
  [["qwen", "alibaba"], "Qwen"],
  [["deepseek"], "DeepSeek"],
  [["amazon"], "Amazon"],
  [["baidu"], "Baidu"],
  [["bytedance", "bytedance-seed", "bytedance seed"], "ByteDance"],
  [["cohere"], "Cohere"],
  [["groq"], "Groq"],
  [["microsoft"], "Microsoft"],
  [["nvidia"], "NVIDIA"],
  [["openrouter"], "OpenRouter"],
  [["perplexity"], "Perplexity"],
  [["tencent"], "Tencent"],
  [["xiaomi"], "Xiaomi"],
  [["minimax"], "MiniMax"],
  [["moonshot", "moonshotai", "moonshot ai"], "Moonshot AI"],
  [["zhipu", "zhipuai", "z-ai", "z.ai", "zai"], "Z.AI"],
  [["ai21", "ai21labs"], "AI21"],
  [["ibm", "ibm-granite"], "IBM"],
  [["together", "togetherai", "together-ai"], "Together AI"],
  [["fireworks", "fireworks-ai"], "Fireworks"],
  [["liquid", "liquidai", "liquid-ai"], "Liquid AI"],
  [["nous", "nousresearch", "nous-research"], "Nous Research"],
];

function canonicalCompany(value: string): string {
  const clean = value.trim().toLowerCase().replace(/^~/, "");
  const alias = ALIASES.find(([keys]) => keys.includes(clean))?.[1];
  if (alias) return alias;
  return value.trim().replace(/(^|-)([a-z])/g, (_, dash: string, letter: string) => `${dash}${letter.toUpperCase()}`);
}

/** Company for an OpenRouter model, from its slug prefix or display name. */
export function companyForModel(slug: string, name: string): string {
  const fromSlug = canonicalCompany(slug.split("/")[0] ?? "OpenRouter");
  if (COMPANY_META.has(fromSlug)) return fromSlug;
  const colon = name.indexOf(":");
  return colon > 0 ? canonicalCompany(name.slice(0, colon)) : fromSlug;
}

/** "Anthropic: Claude Opus 5" → "Claude Opus 5". */
export function trimCompanyPrefix(name: string, company: string): string {
  const normalized = name.replace(/\s+/g, " ").trim();
  const colon = normalized.indexOf(":");
  if (colon > 0 && canonicalCompany(normalized.slice(0, colon)) === company) {
    return normalized.slice(colon + 1).trim();
  }
  return normalized;
}
