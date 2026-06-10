import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Responses route uses terminal gateway auth instead of desktop UI trust", async () => {
  const source = await readFile(new URL("./desktopRoutes.mjs", import.meta.url), "utf8");
  const route = source.match(
    /if \(req\.method === "POST" && url\.pathname === "\/desktop\/v1\/responses"\) \{([\s\S]*?)\n  \}/
  )?.[1] || "";

  assert.match(route, /authorizeTerminalGatewayRequest/);
  assert.match(route, /terminalProviderAdapterForModel\(body\.model\)/);
  assert.match(route, /runtimeId: providerAdapter\?\.runtimeId/);
  assert.match(route, /providerId: terminalProviderIdForModel\(body\.model\)/);
  assert.match(route, /adapterId: "responses"/);
  assert.match(route, /protocol: "openai-responses"/);
  assert.match(route, /model: authorization\.billingModel \|\| body\.model/);
  assert.doesNotMatch(route, /runtimeId: "codex"/);
  assert.doesNotMatch(route, /providerId: "openai"/);
  assert.doesNotMatch(route, /authorizeDesktopUi/);
});
