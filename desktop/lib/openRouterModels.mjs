const OPENROUTER_MODELS_URL = "https://openrouter.ai/api/v1/models?supported_parameters=tools";
const CACHE_MS = 15 * 60 * 1000;
const MAX_LABEL = 96;
const DEFAULT_MODEL_LIMIT = 10;
const NEWEST_MODEL_RESERVE = 4;
const BLOCKED_MODEL_TERMS = [
  "audio", "beta", "browser", "clip", "deepresearch", "embedding", "experimental", "exp",
  "guard", "image", "moderation", "multi-agent", "ocr", "omni", "preview", "rerank",
  "research", "safeguard", "search", "speech", "transcribe", "tts", "ui-tars",
  "vl", "web", "vision", "whisper"
];
const FEATURED_COMPANIES = [
  "OpenAI", "Anthropic", "Google", "xAI", "DeepSeek", "Qwen", "Mistral", "Meta",
  "Microsoft", "Cohere", "Perplexity", "Moonshot AI", "Zhipu", "Amazon", "AI21",
  "IBM", "NVIDIA", "MiniMax", "Tencent", "Baidu", "ByteDance", "Xiaomi", "Groq",
  "Together AI", "Fireworks", "Liquid AI", "Nous Research", "OpenRouter"
];
const COMPANY_PRIORITY = new Map(FEATURED_COMPANIES.map((company, index) => [company, index]));
const COMPANY_MODEL_LIMITS = new Map([
  ["OpenAI", 16], ["Anthropic", 12], ["Google", 12], ["Qwen", 14],
  ["Mistral", 12], ["DeepSeek", 10], ["Meta", 10], ["Microsoft", 8],
  ["Cohere", 8], ["Perplexity", 8], ["Moonshot AI", 8], ["Zhipu", 8],
  ["Amazon", 8], ["AI21", 8], ["IBM", 8], ["OpenRouter", 8]
]);
let cache = null;

export async function openRouterModelPayload(fetchImpl = fetch, options = {}) {
  const now = Date.now();
  if (!options.refresh && cache && now - cache.loadedAt < CACHE_MS) return cache.payload;
  const response = await fetchImpl(OPENROUTER_MODELS_URL, { headers: { Accept: "application/json" } });
  if (!response.ok) throw httpError(502, "Could not load OpenRouter models.");
  const json = await response.json();
  const payload = buildOpenRouterModelPayload(Array.isArray(json?.data) ? json.data : []);
  cache = { loadedAt: now, payload };
  return payload;
}

export function buildOpenRouterModelPayload(models) {
  const options = models.map(normalizeModel).filter(Boolean);
  const companies = new Map();
  for (const model of options) {
    const list = companies.get(model.company) || [];
    list.push(model);
    companies.set(model.company, list);
  }
  const groups = Array.from(companies.entries()).map(([company, modelsForCompany]) => {
    const sorted = selectModelsForCompany(modelsForCompany, modelLimitForCompany(company));
    return {
      company,
      title: company,
      options: sorted,
      score: sorted[0]?.score || 0,
      newest: sorted[0]?.created || 0
    };
  }).sort(compareGroups);
  return {
    ok: true,
    source: "openrouter",
    loadedAt: new Date().toISOString(),
    groups: [{
      title: "",
      company: "Auto",
      options: [{
        key: "auto",
        label: "Auto",
        provider: "auto",
        company: "Auto",
        tier: "budget",
        supportedParameters: ["tools"],
        supportsTools: true,
        supportsReasoning: true
      }]
    }, ...groups.map(({ score, newest, ...group }) => group)]
  };
}

function normalizeModel(model) {
  const id = String(model?.id || "").trim();
  if (!isOpenRouterSlug(id)) return null;
  const supportedParameters = normalizeSupportedParameters(model?.supported_parameters);
  if (!supportedParameters.includes("tools")) return null;
  const output = model?.architecture?.output_modalities;
  const rawCompany = companyName(model, id);
  const created = Number(model?.created) || 0;
  const label = trimCompany(String(model?.name || id), rawCompany).slice(0, MAX_LABEL);
  if (!isFeaturedCompany(rawCompany)) return null;
  if (!isGeneralChatModel(id, label, output)) return null;
  const promptPrice = priceNumber(model?.pricing?.prompt);
  const completionPrice = priceNumber(model?.pricing?.completion);
  const free = id.endsWith(":free")
    || (promptPrice === 0 && completionPrice === 0);
  const tier = modelTier(promptPrice, completionPrice, free);
  const quality = qualityScore(id, label, free);
  return {
    key: id,
    modelKey: id,
    label,
    provider: providerKey(id, rawCompany),
    company: rawCompany,
    tier,
    badge: created > Date.now() / 1000 - 45 * 24 * 60 * 60 ? "New" : "",
    supportedParameters,
    supportsTools: true,
    supportsReasoning: supportedParameters.includes("reasoning"),
    contextLength: Number(model?.context_length || model?.top_provider?.context_length || 0) || 0,
    created,
    score: quality * 1_000_000_000 + created
  };
}

function normalizeSupportedParameters(parameters) {
  if (!Array.isArray(parameters)) return [];
  return Array.from(new Set(parameters
    .filter((parameter) => typeof parameter === "string")
    .map((parameter) => parameter.trim().toLowerCase())
    .filter(Boolean)))
    .sort();
}

function isGeneralChatModel(id, label, output) {
  if (Array.isArray(output) && (output.length !== 1 || output[0] !== "text")) return false;
  const text = `${id} ${label}`.toLowerCase();
  return !BLOCKED_MODEL_TERMS.some((term) => new RegExp(`(^|[^a-z0-9])${term}([^a-z0-9]|$)`, "i").test(text));
}

function companyName(model, id) {
  const slugCompany = canonicalCompany(id.split("/")[0] || "OpenRouter");
  if (knownCompanyName(slugCompany)) return slugCompany;
  const name = String(model?.name || "");
  const colonIndex = name.indexOf(":");
  const fromName = colonIndex > 0 ? name.slice(0, colonIndex).trim() : "";
  return fromName ? canonicalCompany(fromName) : slugCompany;
}

function canonicalCompany(value) {
  const key = String(value || "").trim();
  const lower = key.toLowerCase();
  const clean = lower.replace(/^~/, "");
  if (["anthropic", "claude"].includes(clean)) return "Anthropic";
  if (["google", "google ai studio", "gemini"].includes(clean)) return "Google";
  if (["openai"].includes(clean)) return "OpenAI";
  if (["x-ai", "xai"].includes(clean)) return "xAI";
  if (["mistralai", "mistral ai"].includes(clean)) return "Mistral";
  if (["meta-llama", "meta"].includes(clean)) return "Meta";
  if (["qwen", "alibaba"].includes(clean)) return "Qwen";
  if (["deepseek"].includes(clean)) return "DeepSeek";
  if (["amazon"].includes(clean)) return "Amazon";
  if (["baidu"].includes(clean)) return "Baidu";
  if (["bytedance", "bytedance-seed"].includes(clean)) return "ByteDance";
  if (["cohere"].includes(clean)) return "Cohere";
  if (["groq"].includes(clean)) return "Groq";
  if (["microsoft"].includes(clean)) return "Microsoft";
  if (["nvidia"].includes(clean)) return "NVIDIA";
  if (["openrouter"].includes(clean)) return "OpenRouter";
  if (["perplexity"].includes(clean)) return "Perplexity";
  if (["tencent"].includes(clean)) return "Tencent";
  if (["xiaomi"].includes(clean)) return "Xiaomi";
  if (["minimax"].includes(clean)) return "MiniMax";
  if (["moonshot", "moonshotai"].includes(clean)) return "Moonshot AI";
  if (["zhipu", "zhipuai", "z-ai"].includes(clean)) return "Zhipu";
  if (["ai21", "ai21labs"].includes(clean)) return "AI21";
  if (["ibm", "ibm-granite"].includes(clean)) return "IBM";
  if (["amazon"].includes(clean)) return "Amazon";
  if (["together", "togetherai", "together-ai"].includes(clean)) return "Together AI";
  if (["fireworks", "fireworks-ai"].includes(clean)) return "Fireworks";
  if (["liquid", "liquidai", "liquid-ai"].includes(clean)) return "Liquid AI";
  if (["nous", "nousresearch", "nous-research"].includes(clean)) return "Nous Research";
  return key.replace(/(^|-)([a-z])/g, (_, dash, letter) => `${dash}${letter.toUpperCase()}`);
}

function knownCompanyName(value) {
  return [
    "AI21", "Amazon", "Anthropic", "Baidu", "ByteDance", "Cohere", "DeepSeek",
    "Fireworks", "Google", "Groq", "IBM", "Liquid AI", "Meta", "Microsoft",
    "MiniMax", "Mistral", "Moonshot AI", "Nous Research", "NVIDIA", "OpenAI",
    "OpenRouter", "Perplexity", "Qwen", "Tencent", "Together AI", "xAI",
    "Xiaomi", "Zhipu"
  ].includes(value);
}

function isFeaturedCompany(company) { return COMPANY_PRIORITY.has(company); }

function trimCompany(name, company) {
  return name.replace(new RegExp(`^${escapeRegExp(company)}\\s*:\\s*`, "i"), "").replace(/\s+/g, " ").trim();
}

function providerKey(id, company) {
  const slugProvider = id.split("/")[0]?.toLowerCase() || "";
  if (company === "Anthropic" || slugProvider === "anthropic") return "claude";
  if (company === "Google" || slugProvider === "google") return "gemini";
  if (company === "OpenAI" || slugProvider === "openai") return "openai";
  if (company === "Meta") return "meta";
  if (company === "Mistral") return "mistral";
  if (company === "xAI") return "xai";
  if (company === "Moonshot AI") return "moonshotai";
  if (company === "Zhipu") return "zhipu";
  if (company === "ByteDance") return "bytedance";
  if (company === "Together AI") return "together";
  if (company === "Liquid AI") return "liquid";
  if (company === "Nous Research") return "nous";
  return slugProvider || "openrouter";
}

function modelTier(promptPrice, completionPrice, free) {
  if (free) return "free";
  if (promptPrice === null || completionPrice === null) return "premium";
  if (completionPrice <= 0.000005 && promptPrice <= 0.000001) return "budget";
  if (completionPrice <= 0.00002 && promptPrice <= 0.000005) return "balanced";
  return "premium";
}

function qualityScore(id, label, free) {
  const text = `${id} ${label}`.toLowerCase();
  let score = 70;
  if (/\b(opus|ultra|max|pro)\b/.test(text)) score += 45;
  if (/\b(gpt|claude|gemini|grok|deepseek|qwen|mistral)\b/.test(text)) score += 12;
  if (/\b(agent|code|coding|reasoning|thinking)\b/.test(text)) score += 10;
  if (/\b(sonnet|medium|large|70b|120b)\b/.test(text)) score += 8;
  if (/\b(flash|mini|haiku|nano|lite|small|free)\b/.test(text) || free) score -= 18;
  return score;
}

function compareModels(left, right) {
  return right.score - left.score || right.contextLength - left.contextLength || left.label.localeCompare(right.label);
}

function selectModelsForCompany(models, limit) {
  const byNewest = [...models].sort(compareNewestModels).slice(0, Math.min(NEWEST_MODEL_RESERVE, limit));
  const selected = new Map(byNewest.map((model) => [model.key, model]));
  for (const model of [...models].sort(compareModels)) {
    if (selected.size >= limit) break;
    selected.set(model.key, model);
  }
  return Array.from(selected.values()).sort(compareModels);
}

function compareNewestModels(left, right) {
  return right.created - left.created || compareModels(left, right);
}

function compareGroups(left, right) {
  const leftPriority = COMPANY_PRIORITY.get(left.company) ?? 999;
  const rightPriority = COMPANY_PRIORITY.get(right.company) ?? 999;
  return leftPriority - rightPriority || right.score - left.score || right.newest - left.newest || left.company.localeCompare(right.company);
}

function modelLimitForCompany(company) { return COMPANY_MODEL_LIMITS.get(company) || DEFAULT_MODEL_LIMIT; }

function priceNumber(value) {
  const numeric = Number.parseFloat(String(value ?? ""));
  return Number.isFinite(numeric) && numeric >= 0 ? numeric : null;
}

function isOpenRouterSlug(value) {
  return /^[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._:-]*$/i.test(value) && value.length <= 140;
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}
