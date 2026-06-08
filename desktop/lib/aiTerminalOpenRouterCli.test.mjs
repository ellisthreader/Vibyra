import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  formatAssistantReply,
  normalizeDesktopUrl,
  promptLabelForModel,
  providerInfoForModel,
  renderIntroForModel
} from "./aiTerminalOpenRouterCli.mjs";

const source = readFileSync(new URL("./aiTerminalOpenRouterCli.mjs", import.meta.url), "utf8");

test("AI terminal prompts cannot recursively trigger desktop actions", () => {
  assert.match(source, /disableDesktopActions:\s*true/);
});

test("terminal wrapper canonicalizes Electron desktop page URLs to the bridge origin", () => {
  assert.equal(
    normalizeDesktopUrl("http://127.0.0.1:4317/desktop", "9999"),
    "http://127.0.0.1:4317"
  );
  assert.equal(
    normalizeDesktopUrl("http://127.0.0.1:4317/desktop/", "9999"),
    "http://127.0.0.1:4317"
  );
});

test("API-only OpenRouter providers get Claude-style Vibyra terminal metadata", () => {
  const deepseek = providerInfoForModel("deepseek/deepseek-chat-v3.1");
  const qwen = providerInfoForModel("qwen/qwen3-coder");

  assert.equal(deepseek.name, "DeepSeek");
  assert.equal(deepseek.officialCli, false);
  assert.equal(qwen.name, "Qwen");
  assert.equal(qwen.officialCli, false);
});

test("official CLI providers are marked without changing OpenRouter routing", () => {
  assert.equal(providerInfoForModel("anthropic/claude-sonnet-4").officialCli, true);
  assert.equal(providerInfoForModel("claude-sonnet-4").name, "Claude Code");
  assert.equal(providerInfoForModel("gemini-2.5-pro").name, "Gemini");
  assert.equal(providerInfoForModel("gpt-5.5").name, "OpenAI Codex");
  assert.equal(providerInfoForModel("openai/gpt-4o").officialCli, true);
  assert.equal(providerInfoForModel("google/gemini-2.5-pro").officialCli, true);
});

test("Claude-style intro is customized to the selected API-only model", () => {
  const intro = renderIntroForModel({
    modelKey: "deepseek/deepseek-chat-v3.1",
    reasoningEffort: "high",
    projectId: "project-1",
    cwd: "/home/ellis/Desktop/SaaS",
    columns: 80,
    color: false
  });

  assert.match(intro, /╭/);
  assert.match(intro, /DeepSeek via Vibyra/);
  assert.match(intro, /deepseek\/deepseek-chat-v3\.1 with high effort/);
  assert.match(intro, /OpenRouter API terminal/);
  assert.match(intro, /directory: ~\/Desktop\/SaaS/);
});

test("prompt and replies use Claude-style tokens with model branding", () => {
  assert.equal(promptLabelForModel("qwen/qwen3-coder", false), "❯ qwen:qwen3-coder ");
  assert.equal(formatAssistantReply("First line\nSecond line", "qwen/qwen3-coder", false), "⏺ First line\r\n  Second line");
});

test("official provider fallbacks keep their own terminal cues", () => {
  assert.equal(promptLabelForModel("anthropic/claude-sonnet-4.5", false), "❯ ");
  assert.match(promptLabelForModel("anthropic/claude-sonnet-4.5", true), /\x1b\[38;2;255;155;106m❯\x1b\[0m/);
  assert.equal(promptLabelForModel("openai/gpt-5.1-codex", false), "› ");
  assert.equal(promptLabelForModel("google/gemini-2.5-pro", false), "> ");

  const claude = renderIntroForModel({ modelKey: "anthropic/claude-sonnet-4.5", color: false });
  const gemini = renderIntroForModel({ modelKey: "google/gemini-2.5-pro", color: false });
  const codex = renderIntroForModel({ modelKey: "openai/gpt-5.1-codex", color: false });

  assert.match(claude, /Claude Code v/);
  assert.match(claude, /▐▛███▜▌/);
  assert.match(claude, /Try "edit AppContext\.tsx to\.\.\."/);
  assert.match(claude, /\? for shortcuts/);
  assert.match(gemini, /G E M I N I/);
  assert.match(gemini, /Tips for getting started/);
  assert.match(codex, />_ OpenAI Codex/);
  assert.equal(formatAssistantReply("Ready", "google/gemini-2.5-pro", false), "✦ Ready");
});

test("provider intros display the real process directory instead of the project id", () => {
  const intro = renderIntroForModel({
    modelKey: "openai/gpt-5.5",
    projectId: "L2hvbWUvZWxsaXMvRGVza3RvcC9TYWFT",
    cwd: "/home/ellis/Desktop/SaaS",
    color: false
  });

  assert.match(intro, /directory: ~\/Desktop\/SaaS/);
  assert.doesNotMatch(intro, /L2hvbWUv/);
  assert.doesNotMatch(intro, /~\/workspace/);
});

test("new relevant OpenRouter providers use the basic Vibyra template", () => {
  assert.equal(providerInfoForModel("meta-llama/llama-4-maverick").name, "Meta");
  assert.equal(providerInfoForModel("cohere/command-a").name, "Cohere");
  assert.equal(providerInfoForModel("moonshotai/kimi-k2").name, "Moonshot");
  assert.equal(providerInfoForModel("ibm-granite/granite-3.3-8b-instruct").name, "IBM");
  assert.equal(providerInfoForModel("perplexity/sonar-pro").officialCli, false);
});
