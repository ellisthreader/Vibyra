import assert from "node:assert/strict";
import test from "node:test";
import { handleAiTerminalRuntimeRoutes } from "./aiTerminalRuntimeRoutes.mjs";

test("terminal runtime status route exposes managed runtime state", async () => {
  let status = 0;
  let payload = null;
  const response = {
    writeHead(nextStatus) { status = nextStatus; },
    end(body) { payload = JSON.parse(body); }
  };

  const handled = await handleAiTerminalRuntimeRoutes(
    { method: "GET" },
    response,
    new URL("http://127.0.0.1/desktop/terminal-runtimes")
  );

  assert.equal(handled, true);
  assert.equal(status, 200);
  const codex = payload.runtimes.find((runtime) => runtime.id === "codex");
  const qwen = payload.runtimes.find((runtime) => runtime.id === "qwen");
  const mistral = payload.runtimes.find((runtime) => runtime.id === "mistral");
  assert.equal(codex.adapterReady, true);
  assert.equal(codex.protocol, "openai-responses");
  assert.equal(qwen.adapterReady, false);
  assert.deepEqual(qwen.requirements, { node: ">=22" });
  assert.equal(mistral.version, "2.14.1");
  assert.deepEqual(mistral.requirements, { python: ">=3.12", commands: ["uv"] });
  assert.equal(Object.hasOwn(payload, "providerFallback"), false);
});
