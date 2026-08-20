// Offline fallback roster — used only when OpenRouter is unreachable and
// no cached catalog exists. Native-CLI companies keep their full walls
// (every entry with per-model artwork); the rest get their flagship.

import { COMPANY_META } from "./companyMeta";
import type { CatalogModel, CompanyGroup } from "./catalogTypes";

function entry(id: string, label: string, company: string, contextLength = 200_000): CatalogModel {
  return {
    id,
    label,
    company,
    contextLength,
    tier: "premium",
    isNew: false,
    score: 0,
    created: 0,
    supportsReasoning: company === "OpenAI" || company === "Anthropic",
    reasoningEfforts: [],
    defaultReasoningEffort: null,
    reasoningMandatory: false,
  };
}

const WALLS: Array<[string, Array<[string, string]>]> = [
  ["OpenAI", [
    ["openai/gpt-5.6-sol", "GPT-5.6 Sol"],
    ["openai/gpt-5.6-luna", "GPT-5.6 Luna"],
    ["openai/gpt-5.6-terra", "GPT-5.6 Terra"],
    ["openai/gpt-5.5", "GPT-5.5"],
    ["openai/gpt-5.4", "GPT-5.4"],
    ["openai/gpt-5.4-mini", "GPT-5.4 Mini"],
    ["openai/gpt-5-codex", "GPT-5 Codex"],
  ]],
  ["Anthropic", [
    ["anthropic/claude-opus-5", "Claude Opus 5"],
    ["anthropic/claude-fable-5", "Claude Fable 5"],
    ["anthropic/claude-sonnet-5", "Claude Sonnet 5"],
    ["anthropic/claude-opus-4.8", "Claude Opus 4.8"],
    ["anthropic/claude-opus-4.7", "Claude Opus 4.7"],
    ["anthropic/claude-sonnet-4.6", "Claude Sonnet 4.6"],
    ["anthropic/claude-haiku-4.5", "Claude Haiku 4.5"],
  ]],
  ["Google", [
    ["google/gemini-3.5-flash", "Gemini 3.5 Flash"],
    ["google/gemini-3.1-pro", "Gemini 3.1 Pro"],
    ["google/gemini-3.1-flash-lite", "Gemini 3.1 Flash Lite"],
    ["google/gemini-2.5-pro", "Gemini 2.5 Pro"],
    ["google/gemini-2.5-flash", "Gemini 2.5 Flash"],
  ]],
  ["xAI", [["x-ai/grok-4", "Grok 4"]]],
  ["DeepSeek", [["deepseek/deepseek-chat", "DeepSeek Chat"]]],
  ["Qwen", [["qwen/qwen3-coder", "Qwen3 Coder"]]],
  ["Mistral", [["mistralai/mistral-large", "Mistral Large"]]],
  ["Meta", [["meta-llama/llama-4-maverick", "Llama 4 Maverick"]]],
  ["Microsoft", [["microsoft/phi-4", "Phi 4"]]],
  ["Cohere", [["cohere/command-a", "Command A"]]],
  ["Perplexity", [["perplexity/sonar-pro", "Sonar Pro"]]],
  ["Moonshot AI", [["moonshotai/kimi-k2", "Kimi K2"]]],
  ["Z.AI", [["z-ai/glm-4.6", "GLM 4.6"]]],
  ["Amazon", [["amazon/nova-pro-v1", "Nova Pro"]]],
  ["AI21", [["ai21/jamba-large", "Jamba Large"]]],
  ["IBM", [["ibm-granite/granite-4-h-small", "Granite 4 Small"]]],
  ["NVIDIA", [["nvidia/llama-3.3-nemotron-super-49b-v1", "Nemotron Super 49B"]]],
  ["MiniMax", [["minimax/minimax-m2", "MiniMax M2"]]],
  ["Tencent", [["tencent/hunyuan-a13b-instruct", "Hunyuan A13B"]]],
  ["Baidu", [["baidu/ernie-4.5-300b-a47b", "ERNIE 4.5"]]],
  ["ByteDance", [["bytedance/seed-oss-36b-instruct", "Seed OSS 36B"]]],
  ["Xiaomi", [["xiaomi/mimo-7b-rl", "MiMo 7B"]]],
  ["Groq", [["groq/compound", "Compound"]]],
  ["Together AI", [["together/deepseek-r1-distill", "DeepSeek R1 Distill"]]],
  ["Fireworks", [["fireworks/firefunction-v2", "FireFunction V2"]]],
  ["Liquid AI", [["liquid/lfm-40b", "LFM 40B"]]],
  ["Nous Research", [["nousresearch/hermes-4-405b", "Hermes 4 405B"]]],
  ["OpenRouter", [["openrouter/auto", "Auto Router"]]],
];

export const STATIC_GROUPS: CompanyGroup[] = WALLS.map(([company, models]) => ({
  company,
  providerKey: COMPANY_META.get(company)?.providerKey ?? "openrouter",
  accent: COMPANY_META.get(company)?.accent ?? "#94a3b8",
  models: models.map(([id, label]) => entry(id, label, company)),
}));
