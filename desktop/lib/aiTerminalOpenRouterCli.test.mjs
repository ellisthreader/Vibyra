import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  autoRoutingModel,
  autoRoutingUsesAgent,
  formatAssistantReply,
  formatAutoMatchingStatus,
  formatAutoRoutingStatus,
  formatProviderWorkingStatus,
  interactivePromptForModel,
  normalizeDesktopUrl,
  parseAgentEvent,
  persistAutoTerminalModel,
  promptFrameCloseForModel,
  promptLabelForModel,
  providerInfoForModel,
  renderAgentEvent,
  renderIntroForModel,
  resolveAutoTerminalModel,
  responsesOutputText,
  terminalColorEnabled,
  vibyraAgentArgs
} from "./aiTerminalOpenRouterCli.mjs";

const source = readFileSync(new URL("./aiTerminalOpenRouterCli.mjs", import.meta.url), "utf8");

test("Vibyra Agent keeps the real billed tool engine and serialized input", () => {
  assert.match(source, /let commandQueue = Promise\.resolve\(\)/);
  assert.match(source, /commandQueue = commandQueue\.then\(\(\) => processTerminalLine\(line\)\)/);
  assert.match(source, /terminalState\.activeProcess = child/);
  assert.match(source, /child\.kill\("SIGINT"\)/);
  assert.match(source, /will not fall back to chat-only mode/);
  assert.doesNotMatch(source, /async function sendChatPrompt/);
});

test("agent arguments preserve standard, full, and persistent resume behavior", () => {
  const standard = vibyraAgentArgs({
    desktopUrl: "http://127.0.0.1:4317",
    model: "deepseek/deepseek-chat-v3.1",
    permissionMode: "standard",
    prompt: "Inspect the repository",
    reasoningEffort: "high"
  });
  const full = vibyraAgentArgs({
    desktopUrl: "http://127.0.0.1:4317",
    model: "qwen/qwen3-coder",
    permissionMode: "full",
    prompt: "Run the release build"
  });
  const resumed = vibyraAgentArgs({
    desktopUrl: "http://127.0.0.1:4317",
    model: "deepseek/deepseek-chat-v3.1",
    permissionMode: "standard",
    prompt: "Now run the tests",
    threadId: "thread-123"
  });

  assert.deepEqual(standard.slice(0, 4), ["exec", "--color", "never", "--json"]);
  assert.ok(standard.includes('model_provider="vibyra"'));
  assert.ok(standard.includes('model_providers.vibyra.base_url="http://127.0.0.1:4317/desktop/v1"'));
  assert.ok(standard.includes('model_providers.vibyra.env_key="VIBYRA_TERMINAL_GATEWAY_TOKEN"'));
  assert.ok(standard.includes('shell_environment_policy.exclude=["VIBYRA_TERMINAL_GATEWAY_TOKEN"]'));
  assert.ok(standard.includes("workspace-write"));
  assert.ok(full.includes("--dangerously-bypass-approvals-and-sandbox"));
  assert.deepEqual(resumed.slice(0, 3), ["exec", "resume", "--json"]);
  assert.equal(resumed.at(-2), "thread-123");
  assert.equal(resumed.at(-1), "-");
});

test("gateway credentials stay out of direct shell commands and shutdown reaches active work", () => {
  assert.match(source, /env: shellCommandEnvironment\(\)/);
  assert.match(source, /delete env\.VIBYRA_TERMINAL_GATEWAY_TOKEN/);
  assert.match(source, /process\.on\("SIGTERM", handleTerminate\)/);
  assert.match(source, /child\.kill\("SIGTERM"\)/);
  assert.match(source, /child\.kill\("SIGKILL"\)/);
});

test("all known API provider families receive distinct Vibyra Agent branding", () => {
  const cases = [
    ["deepseek/deepseek-chat-v3.1", "DeepSeek", "DS"],
    ["qwen/qwen3-coder", "Qwen", "QW"],
    ["x-ai/grok-code-fast-1", "xAI", "xAI"],
    ["meta-llama/llama-4-maverick", "Meta", "ME"],
    ["mistralai/mistral-large", "Mistral", "MI"],
    ["moonshotai/kimi-k2", "Moonshot", "KM"],
    ["cohere/command-a", "Cohere", "CO"],
    ["perplexity/sonar-pro", "Perplexity", "PX"],
    ["nvidia/llama-3.3-nemotron", "NVIDIA", "NV"],
    ["ibm-granite/granite-3.3", "IBM", "IBM"]
  ];

  for (const [model, name, mark] of cases) {
    const info = providerInfoForModel(model);
    assert.equal(info.name, name);
    assert.equal(info.mark, mark);
    assert.equal(info.runtime, "vibyra-agent");
    assert.equal(info.officialCli, false);
    assert.equal(info.nativeUi, "");
  }
});

test("API-only intro is modern, customized, and explicit about runtime ownership", () => {
  const intro = renderIntroForModel({
    modelKey: "deepseek/deepseek-chat-v3.1",
    reasoningEffort: "high",
    cwd: "/home/ellis/Desktop/SaaS",
    columns: 80,
    color: false,
    permissionMode: "standard"
  });

  assert.match(intro, /◆ \[ DS \]/);
  assert.match(intro, /DeepSeek via Vibyra Agent/);
  assert.match(intro, /model\s+deepseek\/deepseek-chat-v3\.1/);
  assert.match(intro, /workspace\s+~\/Desktop\/SaaS/);
  assert.match(intro, /access\s+Standard · workspace-write/);
  assert.match(intro, /Real file tools, shell activity, and persistent thread resume/);
  assert.match(intro, /Ctrl\+C cancel/);
});

test("the generalized runtime never copies native provider TUIs", () => {
  for (const model of [
    "anthropic/claude-sonnet-4",
    "openai/gpt-5.5",
    "google/gemini-2.5-pro"
  ]) {
    const intro = renderIntroForModel({ modelKey: model, color: false });
    assert.match(intro, /via Vibyra Agent/);
    assert.doesNotMatch(intro, /Claude Code|OpenAI Codex|Gemini CLI|GEMINI\.md/);
  }
  assert.doesNotMatch(source, /Claude Code|OpenAI Codex|Gemini CLI/);
});

test("prompt, response, working, and activity output use one shared language", () => {
  assert.equal(promptLabelForModel("deepseek/deepseek-chat-v3.1", false), "❯ ");
  assert.equal(interactivePromptForModel("qwen/qwen3-coder", 80, false), "❯ ");
  assert.equal(promptFrameCloseForModel("qwen/qwen3-coder", 80, false), "");
  assert.equal(
    formatAssistantReply("Ready", "qwen/qwen3-coder", false, { showModel: true }),
    "◆ Qwen via Vibyra Agent · qwen/qwen3-coder\r\n  Ready"
  );
  assert.equal(formatProviderWorkingStatus("qwen/qwen3-coder", false), "› Qwen via Vibyra Agent · working");
  assert.equal(
    renderAgentEvent({
      type: "item.started",
      item: { type: "command_execution", command: "npm test" }
    }, false, "qwen/qwen3-coder"),
    "› shell  npm test"
  );
  assert.equal(
    renderAgentEvent({
      type: "item.completed",
      item: { type: "file_change" }
    }, false, "deepseek/deepseek-chat-v3.1"),
    "✓ files  workspace updated"
  );
});

test("Auto remains a truthful Vibyra Agent routing surface", () => {
  const intro = renderIntroForModel({
    modelKey: "auto",
    cwd: "/home/ellis/Desktop/SaaS",
    columns: 80,
    color: false,
    permissionMode: "full"
  });

  assert.match(intro, /VIBYRA AGENT AUTO/);
  assert.match(intro, /####\\\s+\/####/);
  assert.doesNotMatch(intro, /:::/);
  assert.match(intro, /Describe the job\. Vibyra selects the model\./);
  assert.match(intro, /routing\s+best-fit model for first task/);
  assert.doesNotMatch(intro, /per prompt/);
  assert.match(intro, /access\s+Full · unrestricted/);
  assert.match(intro, /The selected provider stays visible/);
  assert.equal(promptLabelForModel("auto", false), "❯ auto ");
});

test("Auto routing announces the selected provider without claiming a native CLI", () => {
  const result = {
    modelKey: "auto",
    autoRouting: {
      selectedModelKey: "deepseek/deepseek-chat-v3.1",
      reason: "Best fit for debugging."
    }
  };

  assert.equal(autoRoutingModel(result), "deepseek/deepseek-chat-v3.1");
  assert.equal(
    formatAutoRoutingStatus(result, false),
    "✓ Routed to deepseek/deepseek-chat-v3.1 · DeepSeek\r\n  Best fit for debugging."
  );
  assert.equal(
    formatAutoMatchingStatus(false),
    "✦ Vibyra is matching your prompt...\r\n  Analyzing task, context, and reasoning needs."
  );
  assert.equal(autoRoutingUsesAgent({ autoRouting: { category: "fast_general" } }), false);
  assert.equal(autoRoutingUsesAgent({ autoRouting: { category: "agentic_coding" } }), true);
});

test("Responses streams and agent JSON events are parsed safely", () => {
  const stream = [
    'data: {"type":"response.output_text.delta","delta":"Sea "}',
    'data: {"type":"response.output_text.delta","delta":"light"}',
    "data: [DONE]"
  ].join("\n\n");

  assert.equal(responsesOutputText(stream), "Sea light");
  assert.deepEqual(
    parseAgentEvent('{"type":"turn.failed","error":{"message":"Provider unavailable"}}'),
    { type: "turn.failed", error: { message: "Provider unavailable" } }
  );
  assert.equal(parseAgentEvent("not-json"), null);
});

test("Auto routing preserves the prompt and persists the selected model", async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    return {
      ok: true,
      async json() {
        return calls.length === 1
          ? {
              ok: true,
              modelKey: "deepseek/deepseek-chat-v3.1",
              autoRouting: { modelKey: "deepseek/deepseek-chat-v3.1" }
            }
          : { ok: true, session: { id: "terminal 1", model: "deepseek/deepseek-chat-v3.1" } };
      }
    };
  };
  const prompt = "Fix exactly this:\nconst value = 1;";
  const routing = await resolveAutoTerminalModel({
    desktopUrl: "http://127.0.0.1:4317/desktop",
    prompt,
    fetchImpl
  });
  const session = await persistAutoTerminalModel({
    desktopUrl: "http://127.0.0.1:4317/desktop",
    terminalId: "terminal 1",
    model: routing.modelKey,
    fetchImpl
  });

  assert.equal(calls[0].url, "http://127.0.0.1:4317/desktop/chat/route");
  assert.deepEqual(JSON.parse(calls[0].options.body), { prompt });
  assert.equal(calls[1].url, "http://127.0.0.1:4317/desktop/pty-terminals/terminal%201/model");
  assert.equal(session.model, "deepseek/deepseek-chat-v3.1");
});

test("desktop URL and color compatibility exports remain stable", () => {
  assert.equal(
    normalizeDesktopUrl("http://127.0.0.1:4317/desktop", "9999"),
    "http://127.0.0.1:4317"
  );
  assert.equal(terminalColorEnabled({ NO_COLOR: "1", VIBYRA_TERMINAL_COLOR: "1" }), true);
  assert.equal(terminalColorEnabled({ NO_COLOR: "1" }), false);
});
