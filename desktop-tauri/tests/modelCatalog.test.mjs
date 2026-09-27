import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import test from "node:test";
import { loadCatalog } from "../src/lib/openRouterCatalog.ts";
import { planRunner } from "../src/lib/modelRunners.ts";
import { modelEffortOptions, resolvedModelEffort } from "../src/lib/modelEffort.ts";
import { modelArtworkFile } from "../src/lib/modelArtworkData.ts";

const cacheKey = "vibyra.modelCatalog.v5";
const flatten = (result) => result.groups.flatMap((group) => group.models);
const raw = { id: "openai/gpt-6-astra", name: "OpenAI: GPT-6 Astra", supported_parameters: ["tools"], context_length: 1_000_000 };
const recentReleases = {
  "openai/gpt-6-astra": "2026-09-03",
  "openai/gpt-6-sol": "2026-09-22",
  "openai/gpt-6-luna": "2026-09-22",
  "anthropic/claude-opus-5.5": "2026-09-22",
  "anthropic/claude-fable-5.1": "2026-09-01",
};

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

test("live refresh retains native Claude models absent from OpenRouter and GPT with live metadata", async (t) => {
  environment(t, [raw]);
  const result = await loadCatalog(true);
  assert.equal(result.source, "live");
  const models = flatten(result);
  assert.equal(models.filter((model) => model.id === raw.id).length, 1);
  assert.equal(models.find((model) => model.id === raw.id).contextLength, 1_000_000);
  assert.equal(models.find((model) => model.id === raw.id).isNew,
    Date.now() - Date.parse("2026-09-03T00:00:00Z") < 45 * 24 * 60 * 60 * 1000);
  assert.ok(models.some((model) => model.id === "anthropic/claude-fable-5.1"));
  assert.ok(models.some((model) => model.id === "anthropic/claude-opus-5.5"));
  assert.ok(models.some((model) => model.id === "openai/gpt-6-sol"));
  assert.ok(models.some((model) => model.id === "openai/gpt-6-luna"));
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
    assert.ok(models.some((model) => model.id === "anthropic/claude-opus-5.5"));
    assert.ok(models.some((model) => model.id === "openai/gpt-6-sol"));
    assert.ok(models.some((model) => model.id === "openai/gpt-6-luna"));
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
    ["openai/gpt-6-sol", "codex", "gpt-6-sol", "ultra"],
    ["openai/gpt-6-luna", "codex", "gpt-6-luna", "max"],
    ["openai/gpt-5.3-codex-spark", "codex", "gpt-5.3-codex-spark", "xhigh"],
    ["anthropic/claude-opus-5.5", "claude", "claude-opus-5-5", "ultracode"],
    ["anthropic/claude-fable-5.1", "claude", "claude-fable-5-1", "ultracode"],
  ]) {
    const model = models.find((candidate) => candidate.id === id);
    const agents = [{ id: runnerId, installed: true }];
    const plan = planRunner(model, agents, [runnerId]);
    assert.equal(plan.runner?.id, runnerId);
    assert.equal(plan.launchModel, expectedId);
    assert.equal(modelEffortOptions(model, runnerId).at(-1)?.value, lastEffort);
    if (id in recentReleases) {
      const artwork = modelArtworkFile(model.id, model.label);
      assert.ok(artwork, `${id} should own artwork`);
      assert.ok(existsSync(new URL(`../src/assets/model-icons/${artwork}`, import.meta.url)), `${id} artwork must be bundled`);
      const released = Date.parse(`${recentReleases[id]}T00:00:00Z`);
      assert.equal(model.isNew, Date.now() - released < 45 * 24 * 60 * 60 * 1000);
    }
    if (id === "anthropic/claude-opus-5.5") assert.equal(resolvedModelEffort(model, runnerId, "none"), "medium");
    assert.equal(planRunner(model, agents, []).runner, null);
    assert.equal(planRunner({ ...model, id: `${id}:unverified` }, agents, [runnerId]).runner, null);
  }
});
