import assert from "node:assert/strict";
import test from "node:test";
import {
  createNativeStreamTranslator,
  nativeRequestToResponses
} from "./desktopNativeTerminalProtocol.mjs";

test("translates Anthropic Messages requests into billed Responses requests", () => {
  const payload = nativeRequestToResponses("anthropic", {
    system: [{ type: "text", text: "Follow repository instructions." }],
    messages: [
      { role: "user", content: [{ type: "text", text: "Inspect the repo." }] },
      {
        role: "assistant",
        content: [{ type: "tool_use", id: "tool_1", name: "shell", input: { command: "pwd" } }]
      },
      {
        role: "user",
        content: [{ type: "tool_result", tool_use_id: "tool_1", content: "/workspace" }]
      }
    ],
    tools: [{ name: "shell", description: "Run a command", input_schema: { type: "object" } }],
    max_tokens: 1200
  }, "anthropic/claude-sonnet-4.6");

  assert.equal(payload.model, "anthropic/claude-sonnet-4.6");
  assert.equal(payload.instructions, "Follow repository instructions.");
  assert.equal(payload.tools[0].name, "shell");
  assert.equal(payload.input[1].type, "function_call");
  assert.equal(payload.input[2].type, "function_call_output");
});

test("translates Gemini GenerateContent requests into billed Responses requests", () => {
  const payload = nativeRequestToResponses("gemini", {
    contents: [{ role: "user", parts: [{ text: "Inspect the repo." }] }],
    tools: [{
      functionDeclarations: [{
        name: "shell",
        description: "Run a command",
        parameters: { type: "object" }
      }]
    }],
    generationConfig: { maxOutputTokens: 900 }
  }, "google/gemini-3.5-flash");

  assert.equal(payload.model, "google/gemini-3.5-flash");
  assert.equal(payload.input[0].content[0].text, "Inspect the repo.");
  assert.equal(payload.tools[0].name, "shell");
  assert.equal(payload.max_output_tokens, 900);
});

test("translates native multi-turn assistant history as Responses input text", () => {
  const gemini = nativeRequestToResponses("gemini", {
    contents: [
      { role: "user", parts: [{ text: "Write one line." }] },
      { role: "model", parts: [{ text: "A quiet line appears." }] },
      { role: "user", parts: [{ text: "Reply only OK." }] }
    ]
  }, "google/gemini-3.1-flash-lite");
  const anthropic = nativeRequestToResponses("anthropic", {
    messages: [
      { role: "user", content: "Write one line." },
      { role: "assistant", content: "A quiet line appears." },
      { role: "user", content: "Reply only OK." }
    ]
  }, "anthropic/claude-haiku-4.5");

  assert.equal(gemini.input[1].role, "assistant");
  assert.equal(gemini.input[1].content[0].type, "input_text");
  assert.equal(anthropic.input[1].role, "assistant");
  assert.equal(anthropic.input[1].content[0].type, "input_text");
});

test("translates Responses streaming text and tools back to Anthropic events", () => {
  let output = "";
  const translator = createNativeStreamTranslator("anthropic", (chunk) => {
    output += chunk;
  });
  for (const data of [
    { type: "response.created", response: { id: "resp_1", model: "anthropic/claude-sonnet-4.6" } },
    { type: "response.output_item.added", item: { type: "function_call", id: "fc_1", call_id: "call_1", name: "shell" } },
    { type: "response.function_call_arguments.delta", delta: "{\"command\":\"pwd\"}" },
    { type: "response.output_item.done", item: { type: "function_call" } },
    { type: "response.completed", response: { usage: { input_tokens: 20, output_tokens: 5 } } }
  ]) translator.event({ name: "", data });

  assert.match(output, /event: message_start/);
  assert.match(output, /"type":"tool_use"/);
  assert.match(output, /"partial_json":"{\\"command\\":\\"pwd\\"}"/);
  assert.match(output, /"stop_reason":"tool_use"/);
  assert.match(output, /event: message_stop/);
});

test("translates Responses streaming text back to Gemini SSE", () => {
  let output = "";
  const translator = createNativeStreamTranslator("gemini", (chunk) => {
    output += chunk;
  });
  translator.event({ data: { type: "response.output_text.delta", delta: "Done" } });
  translator.event({
    data: {
      type: "response.completed",
      response: { usage: { input_tokens: 10, output_tokens: 2 } }
    }
  });

  assert.match(output, /"text":"Done"/);
  assert.match(output, /"finishReason":"STOP"/);
  assert.match(output, /"totalTokenCount":12/);
});
