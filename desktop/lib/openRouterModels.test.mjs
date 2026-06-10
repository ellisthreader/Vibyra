import test from "node:test";
import assert from "node:assert/strict";
import { buildOpenRouterModelPayload } from "./openRouterModels.mjs";

test("OpenRouter models are grouped by company and sorted by capability", () => {
  const payload = buildOpenRouterModelPayload([
    { id: "openai/gpt-4o-mini", name: "OpenAI: GPT 4o Mini", created: 100, architecture: { output_modalities: ["text"] }, pricing: { prompt: "0.0000001", completion: "0.0000004" }, supported_parameters: ["tools"] },
    { id: "openai/gpt-chat-latest", name: "OpenAI: GPT Chat Latest", created: 90, architecture: { output_modalities: ["text"] }, pricing: { prompt: "0.000005", completion: "0.00003" }, supported_parameters: ["tools"] },
    { id: "anthropic/claude-opus-4.7", name: "Anthropic: Claude Opus 4.7", created: 80, architecture: { output_modalities: ["text"] }, pricing: { prompt: "0.00003", completion: "0.00015" }, supported_parameters: ["tools"] },
    { id: "stability/image-only", name: "Stability: Image Only", created: 120, architecture: { output_modalities: ["image"] }, supported_parameters: ["tools"] }
  ]);

  const openAi = payload.groups.find((group) => group.company === "OpenAI");
  const anthropic = payload.groups.find((group) => group.company === "Anthropic");
  assert.equal(payload.groups[0].options[0].key, "auto");
  assert.equal(openAi.options.map((model) => model.key).join(","), "openai/gpt-chat-latest,openai/gpt-4o-mini");
  assert.equal(anthropic.options[0].provider, "claude");
  assert.equal(payload.groups.some((group) => group.company === "Stability"), false);
});

test("OpenRouter model catalog hides non-chat and preview variants", () => {
  const payload = buildOpenRouterModelPayload([
    { id: "openai/gpt-audio", name: "OpenAI: GPT Audio", architecture: { output_modalities: ["text", "audio"] }, supported_parameters: ["tools"] },
    { id: "google/lyria-3-clip-preview", name: "Google: Lyria 3 Clip Preview", architecture: { output_modalities: ["text", "audio"] }, supported_parameters: ["tools"] },
    { id: "openai/gpt-5-image", name: "OpenAI: GPT-5 Image", architecture: { output_modalities: ["image", "text"] }, supported_parameters: ["tools"] },
    { id: "baidu/qianfan-ocr-fast", name: "Baidu: Qianfan-OCR-Fast", architecture: { output_modalities: ["text"] }, supported_parameters: ["tools"] },
    { id: "meta-llama/llama-guard-3-8b", name: "Llama Guard 3 8B", architecture: { output_modalities: ["text"] }, supported_parameters: ["tools"] },
    { id: "openai/gpt-4o-search-preview", name: "OpenAI: GPT-4o Search Preview", architecture: { output_modalities: ["text"] }, supported_parameters: ["tools"] },
    { id: "qwen/qwen3-vl-32b-instruct", name: "Qwen: Qwen3 VL 32B Instruct", architecture: { output_modalities: ["text"] }, supported_parameters: ["tools"] },
    { id: "openai/o3-deep-research", name: "OpenAI: o3 Deep Research", architecture: { output_modalities: ["text"] }, supported_parameters: ["tools"] },
    { id: "deepseek/deepseek-v3.2-exp", name: "DeepSeek: DeepSeek V3.2 Exp", architecture: { output_modalities: ["text"] }, supported_parameters: ["tools"] },
    { id: "openrouter/bodybuilder", name: "OpenRouter: Body Builder (beta)", architecture: { output_modalities: ["text"] }, supported_parameters: ["tools"] },
    { id: "anthropic/claude-sonnet-4.5", name: "Anthropic: Claude Sonnet 4.5", architecture: { output_modalities: ["text"] }, supported_parameters: ["tools"] }
  ]);

  const keys = payload.groups.flatMap((group) => group.options.map((model) => model.key));
  assert.deepEqual(keys, ["auto", "anthropic/claude-sonnet-4.5"]);
});

test("OpenRouter model catalog keeps usable providers and caps noisy groups", () => {
  const payload = buildOpenRouterModelPayload([
    ...Array.from({ length: 20 }, (_, index) => ({
      id: `openai/gpt-${index + 1}-pro`,
      name: `OpenAI: GPT ${index + 1} Pro`,
      architecture: { output_modalities: ["text"] },
      supported_parameters: ["tools"]
    })),
    { id: "perplexity/sonar-pro", name: "Perplexity: Sonar Pro", architecture: { output_modalities: ["text"] }, supported_parameters: ["tools"] },
    { id: "sao10k/l3-euryale-70b", name: "Sao10K: Euryale 70B", architecture: { output_modalities: ["text"] }, supported_parameters: ["tools"] },
    { id: "mistralai/codestral-2508", name: "Mistral: Codestral 2508", architecture: { output_modalities: ["text"] }, supported_parameters: ["tools"] },
    { id: "x-ai/grok-4", name: "xAI: Grok 4", architecture: { output_modalities: ["text"] }, supported_parameters: ["tools"] }
  ]);

  const openAi = payload.groups.find((group) => group.company === "OpenAI");
  const keys = payload.groups.flatMap((group) => group.options.map((model) => model.key));
  assert.equal(openAi.options.length, 16);
  assert(keys.includes("mistralai/codestral-2508"));
  assert(keys.includes("x-ai/grok-4"));
  assert(keys.includes("perplexity/sonar-pro"));
  assert(!keys.includes("sao10k/l3-euryale-70b"));
});

test("OpenRouter companies are canonicalized from provider slugs", () => {
  const payload = buildOpenRouterModelPayload([
    { id: "qwen/qwen-2.5-coder-32b-instruct", name: "Qwen2.5 Coder 32B Instruct", architecture: { output_modalities: ["text"] }, supported_parameters: ["tools"] },
    { id: "mistralai/mistral-large-2411", name: "Mistral Large 2411", architecture: { output_modalities: ["text"] }, supported_parameters: ["tools"] },
    { id: "bytedance-seed/seed-1.6", name: "ByteDance Seed: Seed 1.6", architecture: { output_modalities: ["text"] }, supported_parameters: ["tools"] },
    { id: "moonshotai/kimi-k2", name: "Moonshot AI: Kimi K2", architecture: { output_modalities: ["text"] }, supported_parameters: ["tools"] },
    { id: "cohere/command-a", name: "Cohere: Command A", architecture: { output_modalities: ["text"] }, supported_parameters: ["tools"] },
    { id: "ibm-granite/granite-3.3-8b-instruct", name: "IBM: Granite 3.3 8B Instruct", architecture: { output_modalities: ["text"] }, supported_parameters: ["tools"] }
  ]);

  assert.deepEqual(
    payload.groups.filter((group) => group.company !== "Auto").map((group) => group.company).sort(),
    ["ByteDance", "Cohere", "IBM", "Mistral", "Moonshot AI", "Qwen"]
  );
});

test("OpenRouter reasoning capability follows each model's supported parameters", () => {
  const payload = buildOpenRouterModelPayload([
    { id: "openai/gpt-5.4", name: "OpenAI: GPT-5.4", architecture: { output_modalities: ["text"] }, supported_parameters: ["reasoning", "tools"] },
    { id: "meta-llama/llama-3.3-70b-instruct", name: "Meta: Llama 3.3 70B Instruct", architecture: { output_modalities: ["text"] }, supported_parameters: ["temperature", "tools"] }
  ]);
  const models = payload.groups.flatMap((group) => group.options);

  assert.equal(models.find((model) => model.key === "auto").supportsReasoning, true);
  assert.equal(models.find((model) => model.key === "auto").supportsTools, true);
  assert.equal(models.find((model) => model.key === "openai/gpt-5.4").supportsReasoning, true);
  assert.equal(models.find((model) => model.key === "openai/gpt-5.4").supportsTools, true);
  assert.deepEqual(models.find((model) => model.key === "openai/gpt-5.4").supportedParameters, ["reasoning", "tools"]);
  assert.equal(models.find((model) => model.key === "meta-llama/llama-3.3-70b-instruct").supportsReasoning, false);
});

test("OpenRouter terminal catalog fails closed without explicit tool support", () => {
  const payload = buildOpenRouterModelPayload([
    { id: "openai/tool-model", name: "OpenAI: Tool Model", architecture: { output_modalities: ["text"] }, supported_parameters: [" Tools ", "reasoning", "tools"] },
    { id: "openai/chat-only", name: "OpenAI: Chat Only", architecture: { output_modalities: ["text"] }, supported_parameters: ["reasoning"] },
    { id: "anthropic/unknown-capabilities", name: "Anthropic: Unknown Capabilities", architecture: { output_modalities: ["text"] } }
  ]);
  const models = payload.groups.flatMap((group) => group.options);

  assert.deepEqual(models.map((model) => model.key), ["auto", "openai/tool-model"]);
  assert.deepEqual(models[1].supportedParameters, ["reasoning", "tools"]);
});

test("OpenRouter picker tiers match backend dynamic pricing thresholds", () => {
  const payload = buildOpenRouterModelPayload([
    {
      id: "deepseek/deepseek-v4-flash",
      name: "DeepSeek: DeepSeek V4 Flash",
      architecture: { output_modalities: ["text"] },
      pricing: { prompt: "0.0000001", completion: "0.0000002" },
      supported_parameters: ["tools"]
    },
    {
      id: "x-ai/grok-4.20",
      name: "xAI: Grok 4.20",
      architecture: { output_modalities: ["text"] },
      pricing: { prompt: "0.00000125", completion: "0.0000025" },
      supported_parameters: ["tools"]
    },
    {
      id: "anthropic/claude-opus-expensive",
      name: "Anthropic: Claude Opus Expensive",
      architecture: { output_modalities: ["text"] },
      pricing: { prompt: "0.000006", completion: "0.000021" },
      supported_parameters: ["tools"]
    }
  ]);
  const models = payload.groups.flatMap((group) => group.options);

  assert.equal(models.find((model) => model.key === "deepseek/deepseek-v4-flash").tier, "budget");
  assert.equal(models.find((model) => model.key === "x-ai/grok-4.20").tier, "balanced");
  assert.equal(models.find((model) => model.key === "anthropic/claude-opus-expensive").tier, "premium");
});
