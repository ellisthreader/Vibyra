import test from "node:test";
import assert from "node:assert/strict";

import { agentForModel, matchModel } from "../src/lib/modelMatch.ts";
import { STATIC_GROUPS } from "../src/lib/staticModels.ts";

// The real catalogue, because the whole point is matching what a person says
// against the names that actually exist.
const MODELS = STATIC_GROUPS.flatMap((group) =>
  group.models.map((model) => ({ id: model.id, label: model.label, company: model.company })),
);

const find = (said) => matchModel(said, MODELS)?.id ?? null;

test("the way people actually name the model they want", () => {
  // Every one of these was typed at the real chat and has to land on the same
  // model. "No model here is called GPT Astra" was the bug.
  for (const said of [
    "GPT-6 Astra",
    "gpt-6-astra",
    "GPT astra",
    "gptastra",
    "GPT Astra 6",
    "chat GPT astra 6",
    "openai/gpt-6-astra",
    "astra",
  ]) {
    assert.equal(find(said), "openai/gpt-6-astra", `"${said}" should find GPT-6 Astra`);
  }
});

test("a generation in the name is not thrown away", () => {
  // These differ only by number, so a query carrying one must not land on the
  // other — the failure that opens the wrong model without saying so.
  assert.equal(find("GPT-5.5"), "openai/gpt-5.5");
  assert.equal(find("gpt 5.4 mini"), "openai/gpt-5.4-mini");
  assert.notEqual(find("gpt 5.4 mini"), "openai/gpt-5.4");
});

test("nothing close enough is refused rather than guessed", () => {
  assert.equal(find(""), null);
  assert.equal(find("   "), null);
  assert.equal(find("Definitely Not A Model"), null);
  assert.equal(find("xyzzy"), null);
  assert.equal(matchModel("gpt", []), null, "an empty catalogue matches nothing");
});

test("naming a model is enough to know which CLI runs it", () => {
  // "Open three terminals with GPT-6 Astra" never says `codex`, and the app
  // opening a plain shell instead is what it looked like when it did.
  assert.equal(agentForModel({ id: "openai/gpt-6-astra", label: "GPT-6 Astra", company: "OpenAI" }), "codex");
  assert.equal(agentForModel({ id: "anthropic/claude-fable-5.1", label: "Claude Fable 5.1", company: "Anthropic" }), "claude");
  assert.equal(agentForModel({ id: "google/gemini-3-pro", label: "Gemini 3 Pro", company: "Google" }), "gemini");
  assert.equal(agentForModel({ id: "meta/llama-4", label: "Llama 4", company: "Meta" }), null);
});
