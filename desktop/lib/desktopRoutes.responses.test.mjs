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

test("official Qwen, Kimi, and Mistral routes enforce native runtime ownership", async () => {
  const source = await readFile(new URL("./desktopRoutes.mjs", import.meta.url), "utf8");

  assert.match(source, /"\/desktop\/qwen\/v1\/chat\/completions"/);
  assert.match(
    source,
    /"\/desktop\/qwen\/v1\/chat\/completions"[\s\S]{0,500}allowContainerNetwork:\s*true/
  );
  assert.match(source, /runtimeId: "qwen"/);
  assert.match(source, /providerId: "qwen"/);
  assert.match(source, /adapterId: "openai-chat-completions"/);
  assert.match(source, /protocol: "openai-chat-completions"/);
  assert.match(source, /"\/desktop\/kimi\/v1\/responses"[\s\S]*runtimeId: "kimi"[\s\S]*providerId: "moonshot"/);
  assert.match(source, /"\/desktop\/mistral\/v1\/responses"[\s\S]*runtimeId: "mistral"[\s\S]*providerId: "mistral"/);
});

test("desktop shell accepts a trailing slash without falling through to phone auth", async () => {
  const source = await readFile(new URL("./desktopRoutes.mjs", import.meta.url), "utf8");
  assert.match(
    source,
    /url\.pathname === "\/desktop" \|\| url\.pathname === "\/desktop\/"/
  );
});

test("Team planning routes are desktop-authorized and delegated", async () => {
  const source = await readFile(new URL("./desktopRoutes.mjs", import.meta.url), "utf8");
  assert.match(source, /handleTerminalTeamRoutes/);
  assert.match(
    source,
    /url\.pathname === "\/desktop\/terminal-teams" \|\| url\.pathname\.startsWith\("\/desktop\/terminal-teams\/"\)/
  );
});

test("provider account routes are handled before phone-token fallback", async () => {
  const source = await readFile(new URL("./desktopRoutes.mjs", import.meta.url), "utf8");
  const getRoute = source.indexOf('url.pathname === "/desktop/provider-accounts"');
  const actionRoute = source.indexOf('desktop\\/provider-accounts');
  const phoneFallback = source.indexOf('Missing or invalid desktop token');

  assert.ok(getRoute > 0);
  assert.ok(actionRoute > getRoute);
  assert.ok(phoneFallback > actionRoute);
});
