import test from "node:test";
import assert from "node:assert/strict";
import { localAiStatus, sendLocalVibyraChat } from "./localAi.mjs";

test("local AI status reports the configured model", async () => {
  const status = await localAiStatus(async () => jsonResponse({
    models: [{ name: "qwen3:4b" }]
  }));

  assert.equal(status.available, true);
  assert.equal(status.model, "qwen3:4b");
  assert.equal(status.modelInstalled, true);
});

test("local Vibyra chat sends a specialized bounded Ollama request", async () => {
  const requests = [];
  const result = await sendLocalVibyraChat({
    history: [{ role: "user", text: "Earlier question" }],
    project: "Vibyra",
    projectFiles: [{ path: "desktop/app.html", content: "<main />" }],
    prompt: "Explain the terminal UI"
  }, async (url, options = {}) => {
    requests.push({ url, options });
    if (String(url).endsWith("/api/tags")) return jsonResponse({ models: [{ name: "qwen3:4b" }] });
    return jsonResponse({ model: "qwen3:4b", message: { role: "assistant", content: "Local answer" } });
  });

  assert.equal(result.reply, "Local answer");
  assert.equal(result.provider, "local");
  assert.equal(result.creditCost, null);
  const body = JSON.parse(requests[1].options.body);
  assert.equal(body.stream, false);
  assert.equal(body.model, "qwen3:4b");
  assert.match(body.messages[0].content, /private local assistant inside Vibyra Desktop/);
  assert.match(body.messages.at(-1).content, /Active Vibyra project: Vibyra/);
});

test("local Vibyra chat explains how to install a missing model", async () => {
  await assert.rejects(
    () => sendLocalVibyraChat({ prompt: "Hello" }, async () => jsonResponse({ models: [] })),
    /ollama pull qwen3:4b/
  );
});

function jsonResponse(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return payload;
    }
  };
}
