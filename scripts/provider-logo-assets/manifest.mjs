const LOBE_VERSION = "1.91.0";
const lobe = (file) =>
  `https://cdn.jsdelivr.net/npm/@lobehub/icons-static-svg@${LOBE_VERSION}/icons/${file}.svg`;

export const PROVIDER_LOGO_SIZE = 64;
export const PROVIDER_LOGO_SOURCE_VERSION = `@lobehub/icons-static-svg@${LOBE_VERSION}`;

export const PROVIDER_LOGO_SOURCES = {
  xai: source("Grok", "grok", "https://x.ai/grok"),
  deepseek: source("DeepSeek", "deepseek-color", "https://www.deepseek.com/"),
  qwen: source("Qwen", "qwen-color", "https://qwen.ai/"),
  mistral: source("Mistral", "mistral-color", "https://mistral.ai/"),
  meta: source("Meta", "meta-color", "https://ai.meta.com/"),
  microsoft: source("Microsoft", "microsoft-color", "https://www.microsoft.com/ai"),
  cohere: source("Cohere", "cohere-color", "https://cohere.com/"),
  perplexity: source("Perplexity", "perplexity-color", "https://www.perplexity.ai/"),
  moonshot: source("Kimi", "kimi-color", "https://www.kimi.com/"),
  zhipu: source("Zhipu", "zhipu-color", "https://www.zhipuai.cn/"),
  alibaba: source("Alibaba", "alibaba-color", "https://www.alibabacloud.com/"),
  tencent: source("Hunyuan", "hunyuan-color", "https://hunyuan.tencent.com/"),
  baidu: source("Baidu", "baidu-color", "https://cloud.baidu.com/product/wenxinworkshop"),
  bytedance: source("Doubao", "doubao-color", "https://www.doubao.com/"),
  xiaomi: source("MiMo", "xiaomimimo", "https://mimo.xiaomi.com/"),
  nvidia: source("NVIDIA", "nvidia-color", "https://www.nvidia.com/en-us/ai/"),
  minimax: source("MiniMax", "minimax-color", "https://www.minimax.io/"),
  amazon: source("AWS", "aws-color", "https://aws.amazon.com/ai/"),
  ai21: source("AI21", "ai21-brand-color", "https://www.ai21.com/"),
  ibm: source("IBM Granite", "ibm", "https://www.ibm.com/granite"),
  groq: source("Groq", "groq", "https://groq.com/"),
  together: source("Together AI", "together-color", "https://www.together.ai/"),
  fireworks: source("Fireworks AI", "fireworks-color", "https://fireworks.ai/"),
  liquid: source("Liquid AI", "liquid", "https://www.liquid.ai/"),
  nous: source("Nous Research", "nousresearch", "https://nousresearch.com/"),
  openrouter: source("OpenRouter", "openrouter", "https://openrouter.ai/"),
  anthropic: source("Anthropic", "anthropic", "https://www.anthropic.com/"),
  openai: source("OpenAI", "openai", "https://openai.com/"),
  google: source("Gemma", "gemma-color", "https://ai.google.dev/gemma")
};

function source(mark, file, brandPage) {
  return {
    mark,
    brandPage,
    assetUrl: lobe(file),
    assetSource: PROVIDER_LOGO_SOURCE_VERSION,
    assetAuthority: "pinned-community-vector",
    fallback: false,
    fallbackReason: null,
    licensePage: "https://github.com/lobehub/lobe-icons/blob/master/LICENSE"
  };
}
