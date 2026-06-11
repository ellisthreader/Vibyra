const PROVIDER_SPECS = {
  xai: spec("xAI", "xAI", "xai", "38;2;232;232;238", "Grok", "xai", "slash", "electric"),
  deepseek: spec("DeepSeek", "DS", "deepseek", "38;2;78;134;255", "", "deepseek", "keel", "sonar"),
  qwen: spec("Qwen", "QW", "qwen", "38;2;139;92;255", "", "qwen", "prism", "orbit"),
  mistral: spec("Mistral AI", "MI", "mistral", "38;2;255;143;66", "", "mistral", "stair", "ember"),
  meta: spec("Meta", "ME", "meta", "38;2;77;145;255", "Llama", "meta", "loop", "current"),
  microsoft: spec("Microsoft", "MS", "microsoft", "38;2;74;168;255", "", "microsoft", "tile", "grid"),
  cohere: spec("Cohere", "CO", "cohere", "38;2;255;119;102", "", "cohere", "bubble", "pulse"),
  perplexity: spec("Perplexity", "PX", "perplexity", "38;2;32;201;185", "", "perplexity", "weave", "inquiry"),
  moonshot: spec("Moonshot AI", "KM", "moonshot", "38;2;23;131;255", "Kimi", "moonshot", "crescent", "lunar"),
  zhipu: spec("Z.ai", "GLM", "zhipu", "38;2;91;119;255", "GLM", "zhipu", "facet", "reason"),
  alibaba: spec("Alibaba", "ALI", "alibaba", "38;2;255;115;56", "", "alibaba", "canopy", "market"),
  tencent: spec("Tencent", "TC", "tencent", "38;2;49;134;255", "", "tencent", "cross", "signal"),
  baidu: spec("Baidu", "BD", "baidu", "38;2;63;111;255", "", "baidu", "paw", "search"),
  bytedance: spec("ByteDance", "BDY", "bytedance", "38;2;66;184;245", "", "bytedance", "ribbon", "rhythm"),
  xiaomi: spec("Xiaomi", "MI", "xiaomi", "38;2;255;105;0", "", "xiaomi", "arch", "compact"),
  nvidia: spec("NVIDIA", "NV", "nvidia", "38;2;118;185;0", "", "nvidia", "lens", "compute"),
  minimax: spec("MiniMax", "MM", "minimax", "38;2;226;92;214", "", "minimax", "hourglass", "scale"),
  amazon: spec("Amazon Web Services", "AWS", "amazon", "38;2;255;153;0", "Bedrock", "amazon", "arc", "cloud"),
  ai21: spec("AI21", "AI21", "ai21", "38;2;90;205;170", "", "ai21", "block", "studio"),
  ibm: spec("IBM", "IBM", "ibm", "38;2;69;137;255", "Granite", "ibm", "strata", "granite"),
  groq: spec("Groq", "GRQ", "groq", "38;2;245;104;67", "", "groq", "coil", "speed"),
  together: spec("Together AI", "TGA", "together", "38;2;151;105;255", "", "together", "join", "collective"),
  fireworks: spec("Fireworks AI", "FW", "fireworks", "38;2;103;32;255", "", "fireworks", "burst", "spark"),
  liquid: spec("Liquid AI", "LQ", "liquid", "38;2;43;196;181", "", "liquid", "wave", "flow"),
  nous: spec("Nous Research", "NOUS", "nous", "38;2;181;108;255", "", "nous", "labyrinth", "research"),
  openrouter: spec("OpenRouter", "OR", "openrouter", "38;2;139;92;255", "", "openrouter", "route", "relay"),
  anthropic: spec("Anthropic", "AN", "anthropic", "38;2;255;155;106", "", "anthropic", "apex", "thought"),
  openai: spec("OpenAI", "OA", "openai", "38;2;86;182;194", "", "openai", "knot", "synthesis"),
  google: spec("Google DeepMind", "GO", "google", "38;2;74;144;226", "Gemma", "google", "gem", "spectrum")
};

const ALIASES = {
  "x-ai": "xai", "meta-llama": "meta", mistralai: "mistral", moonshotai: "moonshot",
  zhipuai: "zhipu", "z-ai": "zhipu", "bytedance-seed": "bytedance",
  ai21labs: "ai21", "ibm-granite": "ibm", "together-ai": "together",
  "fireworks-ai": "fireworks", "liquid-ai": "liquid", nousresearch: "nous",
  "nous-research": "nous", claude: "anthropic", gemini: "google"
};

export function providerInfoForModel(modelKey = "auto") {
  if (isAutoModel(modelKey)) {
    return providerInfo("vibyra", spec("Vibyra", "V", "vibyra", "38;2;139;92;255", "Auto", "vibyra", "v", "adaptive"));
  }
  const providerKey = providerKeyForModel(modelKey);
  const family = ALIASES[providerKey] || providerKey;
  return providerInfo(providerKey, PROVIDER_SPECS[family] || fallbackSpec(providerKey), !PROVIDER_SPECS[family]);
}

export function registeredProviderFamilies() {
  return Object.keys(PROVIDER_SPECS);
}

export function providerKeyForModel(modelKey = "auto") {
  const key = String(modelKey || "auto").trim().toLowerCase();
  if (isAutoModel(key)) return "vibyra";
  if (key.includes("/")) return key.split("/")[0];
  if (key.startsWith("claude-")) return "claude";
  if (key.startsWith("gemini-")) return "gemini";
  if (key.startsWith("gpt-") || key.includes("codex")) return "openai";
  return key || "openrouter";
}

export function isAutoModel(modelKey) {
  return String(modelKey || "auto").trim().toLowerCase() === "auto";
}

export function providerTokens(info) {
  return info?.theme?.tokens || { assistant: "◆", activity: "›", result: "✓" };
}

function providerInfo(provider, data, fallback = false) {
  return {
    provider, officialCli: false, nativeUi: "", runtime: "vibyra-agent", fallback,
    name: data.name, mark: data.mark, prompt: data.prompt, color: data.color,
    modelFamily: data.modelFamily,
    theme: {
      id: data.prompt, accent: data.color, accentMuted: data.muted,
      dimension: data.dimension, motion: data.motion, logoId: data.logoId,
      tokens: data.tokens,
      prompt: { glyph: data.tokens.prompt, label: data.prompt },
      activity: { glyph: data.tokens.activity, verb: data.activity },
      status: { working: data.working, ready: data.ready, success: data.success }
    }
  };
}

function spec(name, mark, prompt, color, modelFamily, logoId, dimension, motion) {
  const glyphs = ["◆", "◇", "◈", "▸", "●", "✦", "◉", "▰"];
  const index = stableHash(prompt) % glyphs.length;
  return {
    name, mark, prompt, color, modelFamily, logoId, dimension, motion,
    muted: color.replace("38;2;", "38;2;"),
    tokens: { assistant: glyphs[index], activity: ["›", "·", "↳", "»"][index % 4], result: "✓", prompt: ["❯", "›", ">"][index % 3] },
    activity: ["working", "mapping", "reasoning", "building"][index % 4],
    working: `${motion} in progress`, ready: `${motion} ready`, success: `${motion} complete`
  };
}

function fallbackSpec(providerKey) {
  const key = compactToken(providerKey || "openrouter");
  const hash = stableHash(key);
  const palettes = ["38;2;139;92;255", "38;2;45;190;180", "38;2;238;116;82", "38;2;90;145;255", "38;2;218;91;183"];
  const mark = initials(key);
  return spec(
    titleCase(key),
    mark,
    key,
    palettes[hash % palettes.length],
    "",
    "",
    ["facet", "keel", "prism", "arc"][hash % 4],
    ["signal", "current", "pulse", "orbit"][hash % 4]
  );
}

function stableHash(value) {
  let hash = 2166136261;
  for (const character of value) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  return hash >>> 0;
}

function titleCase(value) {
  return compactToken(value).replace(/-/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function initials(value) {
  const parts = compactToken(value).split("-");
  return (parts.length > 1 ? parts.map((part) => part[0]).join("") : parts[0].slice(0, 4)).toUpperCase() || "OR";
}

function compactToken(value) {
  return String(value || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "model";
}
