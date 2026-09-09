import assert from "node:assert/strict";
import test from "node:test";
import { loadCatalog } from "../src/lib/openRouterCatalog.ts";
import { planRunner } from "../src/lib/modelRunners.ts";
import { modelEffortOptions } from "../src/lib/modelEffort.ts";

const cacheKey = "vibyra.modelCatalog.v5";
const flatten = (result) => result.groups.flatMap((group) => group.models);
const raw = { id: "openai/gpt-6-astra", name: "OpenAI: GPT-6 Astra", supported_parameters: ["tools"], context_length: 1_000_000 };

function environment(t, data, cache) {
  const values = new Map(cache ? [[cacheKey, JSON.stringify(cache)]] : []);
  const original = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  } });
  t.after(() => original ? Object.defineProperty(globalThis, "localStorage", original) : delete globalThis.localStorage);
  t.mock.method(globalThis, "fetch", async () => {
    if (data instanceof Error) throw data;
    return { ok: true, json: async () => ({ data }) };
  });
}

test("live refresh retains native Claude models absent from OpenRouter and GPT without artwork", async (t) => {
  environment(t, [raw]);
  const result = await loadCatalog(true);
  assert.equal(result.source, "live");
  const models = flatten(result);
  assert.equal(models.filter((model) => model.id === raw.id).length, 1);
  assert.equal(models.find((model) => model.id === raw.id).contextLength, 1_000_000);
  assert.ok(models.some((model) => model.id === "anthropic/claude-fable-5.1"));
  assert.ok(models.some((model) => model.id === "openai/gpt-5.3-codex-spark"));
});

for (const offline of [false, true]) {
  test(`old ${offline ? "offline" : "fresh"} cache gains newly shipped native models`, async (t) => {
    environment(t, new Error("offline"), { savedAt: offline ? 0 : Date.now(), groups: [] });
    const result = await loadCatalog();
    assert.equal(result.source, "cache");
    const models = flatten(result);
    assert.ok(models.some((model) => model.id === raw.id));
    assert.ok(models.some((model) => model.id === "anthropic/claude-fable-5.1"));
  });
}

test("empty live response retains cached third-party models", async (t) => {
  const group = { company: "DeepSeek", providerKey: "deepseek", accent: "#fff", models: [{ id: "deepseek/deepseek-chat" }] };
  environment(t, [], { savedAt: 0, groups: [group] });
  assert.ok(flatten(await loadCatalog(true)).some((model) => model.id === "deepseek/deepseek-chat"));
});

test("new native models launch with exact CLI IDs and supported effort", async (t) => {
  environment(t, new Error("offline"));
  const models = flatten(await loadCatalog(true));
  for (const [id, runnerId, expectedId, lastEffort] of [
    ["openai/gpt-6-astra", "codex", "gpt-6-astra", "ultra"],
    ["openai/gpt-5.3-codex-spark", "codex", "gpt-5.3-codex-spark", "xhigh"],
    ["anthropic/claude-fable-5.1", "claude", "claude-fable-5-1", "ultracode"],
  ]) {
    const model = models.find((candidate) => candidate.id === id);
    const agents = [{ id: runnerId, installed: true }];
    const plan = planRunner(model, agents, [runnerId]);
    assert.equal(plan.runner?.id, runnerId);
    assert.equal(plan.launchModel, expectedId);
    assert.equal(modelEffortOptions(model, runnerId).at(-1)?.value, lastEffort);
    assert.equal(planRunner(model, agents, []).runner, null);
    assert.equal(planRunner({ ...model, id: `${id}:unverified` }, agents, [runnerId]).runner, null);
  }
});
