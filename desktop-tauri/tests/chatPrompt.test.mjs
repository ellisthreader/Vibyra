import assert from "node:assert/strict";
import test from "node:test";

import { CONTEXT_OFF, MAX_SYSTEM_CHARS, systemPrompt } from "../src/lib/chatPrompt.ts";

const project = { name: "Studio", root: "/Projects/Studio" };
const brief = (text) => ({ text, shape: "repository", codebase: true, chars: text.length, truncated: [] });

test("a written reply is asked for as rendered markdown, with runnable fences", () => {
  const prompt = systemPrompt(brief("Branch: main"), project, false);
  assert.match(prompt, /markdown/);
  assert.match(prompt, /table/);
  assert.ok(prompt.includes("```bash"), "the shape of a command block is shown, not described");
  assert.match(prompt, /Run button/, "the model is told its fences become buttons");
  assert.match(prompt, /Studio at \/Projects\/Studio/);
  assert.match(prompt, /Branch: main/);
});

test("a spoken reply replaces the written rules rather than adding to them", () => {
  const spoken = systemPrompt(brief("Branch: main"), project, true);
  assert.match(spoken, /spoken aloud/);
  assert.match(spoken, /No markdown/);
  assert.doesNotMatch(spoken, /Run button/, "the two styles are exclusive, or the prompt contradicts itself");
  assert.equal(spoken.includes("```bash"), false);
});

test("a brief that could not be read is said out loud, not papered over", () => {
  const blind = systemPrompt(null, project, false);
  assert.match(blind, /could not read this folder/);
  assert.match(blind, /Studio at \/Projects\/Studio/);
  assert.doesNotMatch(blind, /Branch/);
});

test("switching context off says so instead of pretending the folder is empty", () => {
  const off = systemPrompt(CONTEXT_OFF, project, false);
  assert.match(off, /switched off in Settings/);
  assert.doesNotMatch(off, /could not read this folder/);
  assert.ok(off.length <= MAX_SYSTEM_CHARS);
});
