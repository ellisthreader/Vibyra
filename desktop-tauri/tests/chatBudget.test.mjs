import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { MAX_CONTEXT_TURNS } from "../src/state/chatLedger.ts";
import { MAX_BRIEF_CHARS, MAX_SYSTEM_CHARS, systemPrompt } from "../src/lib/chatPrompt.ts";

// The prompt budget has two ends and they are written in two languages. Rust
// enforces the payload ceilings; the prompt is composed in TypeScript against
// them. Nothing at runtime would report a disagreement — a system prompt that
// outgrew the per-message cap would simply be trimmed, and the history it
// crowded out would vanish without a word. This is where that shows up.

function rustConst(path, name) {
  const source = readFileSync(new URL(path, import.meta.url), "utf8");
  const match = source.match(new RegExp(`const ${name}: usize = ([\\d_]+)`));
  assert.ok(match, `${name} is no longer declared in ${path}`);
  return Number(match[1].replaceAll("_", ""));
}

// The ceilings moved out of ai.rs in the streaming split; they live here now.
const CLAMP = "../src-tauri/src/commands/ai_clamp.rs";
const MAX_CHARS_PER_MESSAGE = rustConst(CLAMP, "MAX_CHARS_PER_MESSAGE");
const MAX_TOTAL_CHARS = rustConst(CLAMP, "MAX_TOTAL_CHARS");
const BRIEF_TOTAL = rustConst("../src-tauri/crates/vibyra-core/src/brief/budget.rs", "TOTAL_CHARS");

test("the system prompt and the brief inside it fit one message", () => {
  // The assembled prompt *contains* the brief, so it is the prompt's ceiling
  // that has to fit Rust's per-message cap — adding the two double-counted.
  assert.ok(
    MAX_SYSTEM_CHARS <= MAX_CHARS_PER_MESSAGE,
    `${MAX_SYSTEM_CHARS} exceeds the ${MAX_CHARS_PER_MESSAGE} Rust allows per message`,
  );
  assert.ok(MAX_BRIEF_CHARS < MAX_SYSTEM_CHARS, "the brief must leave room for the rules around it");
  assert.equal(
    MAX_BRIEF_CHARS,
    BRIEF_TOTAL,
    "the brief builder and the prompt must agree on how large a brief can be",
  );
});

test("a brief at its ceiling still leaves room for the rules around it", () => {
  const text = "B".repeat(MAX_BRIEF_CHARS);
  const prompt = systemPrompt(
    { text, shape: "repository", codebase: true, chars: text.length, truncated: [] },
    { name: "Studio", root: "/Projects/Studio" },
    false,
  );
  assert.ok(prompt.length <= MAX_SYSTEM_CHARS, `a maximal prompt is ${prompt.length} chars`);
  assert.ok(prompt.includes(text), "the whole brief survives — growing the rules must not trim it");
});

test("a full workspace state is paid for by the brief, never by the rules", () => {
  const text = "B".repeat(MAX_BRIEF_CHARS);
  const state = `Vibyra right now:\n${"S".repeat(1_580)}`;
  const prompt = systemPrompt(
    { text, shape: "repository", codebase: true, chars: text.length, truncated: [] },
    { name: "Studio", root: "/Projects/Studio" },
    false,
    state,
  );
  assert.ok(prompt.length <= MAX_SYSTEM_CHARS, `a maximal prompt is ${prompt.length} chars`);
  assert.ok(prompt.includes(state), "the live workspace survives whole");
  assert.match(prompt, /Run button/, "the rules after it survive whole");
});

test("the conversation still has somewhere to live once the prompt is paid for", () => {
  const history = MAX_TOTAL_CHARS - MAX_SYSTEM_CHARS;
  assert.ok(
    history >= MAX_CONTEXT_TURNS * 1_000,
    `${history} chars is not ${MAX_CONTEXT_TURNS} turns of conversation`,
  );
});
