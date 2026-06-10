const PROVIDERS = {
  "x-ai": provider("xAI", "xAI", "xai", "38;2;232;232;238", "Grok"),
  xai: provider("xAI", "xAI", "xai", "38;2;232;232;238", "Grok"),
  deepseek: provider("DeepSeek", "DS", "deepseek", "38;2;78;134;255"),
  qwen: provider("Qwen", "QW", "qwen", "38;2;139;92;255"),
  mistralai: provider("Mistral", "MI", "mistral", "38;2;255;143;66"),
  mistral: provider("Mistral", "MI", "mistral", "38;2;255;143;66"),
  meta: provider("Meta", "ME", "meta", "38;2;77;145;255", "Llama"),
  "meta-llama": provider("Meta", "ME", "meta", "38;2;77;145;255", "Llama"),
  microsoft: provider("Microsoft", "MS", "microsoft", "38;2;74;168;255"),
  cohere: provider("Cohere", "CO", "cohere", "38;2;255;119;102"),
  perplexity: provider("Perplexity", "PX", "perplexity", "38;2;32;201;185"),
  moonshotai: provider("Moonshot", "KM", "moonshot", "38;2;159;111;255", "Kimi"),
  moonshot: provider("Moonshot", "KM", "moonshot", "38;2;159;111;255", "Kimi"),
  zhipuai: provider("Zhipu", "GLM", "zhipu", "38;2;91;119;255", "GLM"),
  zhipu: provider("Zhipu", "GLM", "zhipu", "38;2;91;119;255", "GLM"),
  "z-ai": provider("Zhipu", "GLM", "zhipu", "38;2;91;119;255", "GLM"),
  alibaba: provider("Alibaba", "ALI", "alibaba", "38;2;255;115;56"),
  tencent: provider("Tencent", "TC", "tencent", "38;2;49;134;255"),
  baidu: provider("Baidu", "BD", "baidu", "38;2;63;111;255"),
  bytedance: provider("ByteDance", "BDY", "bytedance", "38;2;66;184;245"),
  "bytedance-seed": provider("ByteDance", "BDY", "bytedance", "38;2;66;184;245"),
  xiaomi: provider("Xiaomi", "MI", "xiaomi", "38;2;255;105;0"),
  nvidia: provider("NVIDIA", "NV", "nvidia", "38;2;118;185;0"),
  minimax: provider("MiniMax", "MM", "minimax", "38;2;226;92;214"),
  amazon: provider("Amazon", "AWS", "amazon", "38;2;255;153;0"),
  ai21: provider("AI21", "AI21", "ai21", "38;2;90;205;170"),
  ai21labs: provider("AI21", "AI21", "ai21", "38;2;90;205;170"),
  ibm: provider("IBM", "IBM", "ibm", "38;2;69;137;255", "Granite"),
  "ibm-granite": provider("IBM", "IBM", "ibm", "38;2;69;137;255", "Granite"),
  groq: provider("Groq", "GRQ", "groq", "38;2;245;104;67"),
  together: provider("Together AI", "TGA", "together", "38;2;151;105;255"),
  "together-ai": provider("Together AI", "TGA", "together", "38;2;151;105;255"),
  fireworks: provider("Fireworks", "FW", "fireworks", "38;2;255;83;101"),
  "fireworks-ai": provider("Fireworks", "FW", "fireworks", "38;2;255;83;101"),
  liquid: provider("Liquid AI", "LQ", "liquid", "38;2;43;196;181"),
  "liquid-ai": provider("Liquid AI", "LQ", "liquid", "38;2;43;196;181"),
  nous: provider("Nous Research", "NOUS", "nous", "38;2;181;108;255"),
  nousresearch: provider("Nous Research", "NOUS", "nous", "38;2;181;108;255"),
  "nous-research": provider("Nous Research", "NOUS", "nous", "38;2;181;108;255"),
  openrouter: provider("OpenRouter", "OR", "openrouter", "38;2;139;92;255"),
  anthropic: provider("Anthropic", "AN", "anthropic", "38;2;255;155;106", "Claude"),
  claude: provider("Anthropic", "AN", "anthropic", "38;2;255;155;106", "Claude"),
  openai: provider("OpenAI", "OA", "openai", "38;2;86;182;194"),
  google: provider("Google", "GO", "google", "38;2;74;144;226", "Gemini"),
  gemini: provider("Google", "GO", "google", "38;2;74;144;226", "Gemini")
};

export function providerInfoForModel(modelKey = "auto") {
  if (isAutoModel(modelKey)) {
    return {
      provider: "vibyra",
      name: "Vibyra",
      mark: "V",
      prompt: "auto",
      color: "38;2;139;92;255",
      modelFamily: "Auto",
      officialCli: false,
      nativeUi: "",
      runtime: "vibyra-agent"
    };
  }
  const providerKey = providerKeyForModel(modelKey);
  const info = PROVIDERS[providerKey] || provider(
    titleCase(providerKey || "OpenRouter"),
    initials(providerKey || "OR"),
    compactToken(providerKey || "openrouter"),
    "38;2;139;92;255"
  );
  return {
    provider: providerKey,
    officialCli: false,
    nativeUi: "",
    runtime: "vibyra-agent",
    ...info
  };
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

export function providerTokens() {
  return { assistant: "◆", activity: "›", result: "✓" };
}

function provider(name, mark, prompt, color, modelFamily = "") {
  return { name, mark, prompt, color, modelFamily };
}

function titleCase(value) {
  return compactToken(value).replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function initials(value) {
  const clean = compactToken(value).replace(/[^a-z0-9]/gi, "");
  return (clean.slice(0, 4) || "OR").toUpperCase();
}

function compactToken(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "model";
}
