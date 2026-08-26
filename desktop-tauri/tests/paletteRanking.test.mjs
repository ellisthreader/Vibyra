import assert from "node:assert/strict";
import test from "node:test";

import { rankPaletteEntries } from "../src/lib/paletteRanking.ts";

const run = () => {};

const BASE = [
  { id: "attn-1", kind: "attention", group: "Needs you", label: "Approve — Claude Code wants to run npm test", weight: 900, run },
  { id: "sess-1", kind: "session", group: "Sessions", label: "Claude Code", run },
  { id: "sess-restart", kind: "command", group: "This session", label: "Restart Claude Code", run },
  { id: "sess-close", kind: "command", group: "This session", label: "Close Claude Code", keywords: "stop kill", danger: true, run },
  { id: "proj-a", kind: "project", group: "Projects", label: "Vibyra", run },
  { id: "stage-split", kind: "command", group: "View", label: "Stage: Split", run },
];

const noAsk = () => [];
const rank = (query, ask = noAsk, recents = []) => rankPaletteEntries(BASE, query, ask, recents);

test("an empty query keeps the curated order and its headings", () => {
  const result = rank("");
  assert.equal(result.grouped, true);
  assert.deepEqual(result.entries.map((entry) => entry.id), BASE.map((entry) => entry.id));
});

test("a query ranks the rows and drops the headings", () => {
  const result = rank("restart");
  assert.equal(result.grouped, false, "ranked rows must not be cut into groups");
  assert.equal(result.entries[0].id, "sess-restart");
});

test("each scope prefix narrows to its own kind", () => {
  assert.deepEqual(rank(">").entries.map((entry) => entry.id), [
    "sess-restart",
    "sess-close",
    "stage-split",
  ]);
  assert.deepEqual(rank("@").entries.map((entry) => entry.id), ["attn-1", "sess-1"]);
  assert.deepEqual(rank("#").entries.map((entry) => entry.id), ["proj-a"]);
});

test("a scope prefix still searches within its slice", () => {
  // `@` covers sessions and the ones blocked on an answer, and nothing else:
  // "Restart Claude Code" is a command, so it stays out even though it matches.
  const result = rank("@claude");
  assert.deepEqual(result.entries.map((entry) => entry.id), ["attn-1", "sess-1"]);
});

test("a waiting agent outranks an equally good match that is not waiting", () => {
  // Both labels open on the same phrase; only one of them is blocking you.
  const result = rank("claude");
  assert.equal(result.entries[0].id, "attn-1", result.entries.map((entry) => entry.id).join(","));
});

test("ask mode builds its rows from the message and never scores them away", () => {
  const built = [];
  const ask = (text) => {
    built.push(text);
    return [{ id: "ask-1", kind: "command", group: "Send", label: "Send to Claude Code", run }];
  };
  const result = rank("!run the tests and fix what breaks", ask);
  assert.deepEqual(built, ["run the tests and fix what breaks"]);
  assert.equal(result.scope, "ask");
  assert.equal(result.text, "run the tests and fix what breaks");
  // The message shares almost nothing with the row's label; it must survive.
  assert.deepEqual(result.entries.map((entry) => entry.id), ["ask-1"]);
});

test("ask mode never reaches the base list", () => {
  assert.deepEqual(rank("!restart", noAsk).entries, []);
});

test("what you ran last breaks ties but cannot overturn a better match", () => {
  const tied = rank("close", noAsk, ["sess-close"]);
  assert.equal(tied.entries[0].id, "sess-close");

  // "restart" is a whole-phrase hit on one row and nothing at all on the
  // other, so habit must not be able to reorder them.
  const decided = rank("restart", noAsk, ["sess-close", "sess-restart"]);
  assert.equal(decided.entries[0].id, "sess-restart");
});

test("hidden keywords reach a row whose label does not contain the word", () => {
  const result = rank("kill");
  assert.deepEqual(result.entries.map((entry) => entry.id), ["sess-close"]);
  assert.deepEqual(result.entries[0].ranges, [], "a keyword hit must not highlight the label");
});

test("a query nothing answers returns an empty list, not everything", () => {
  assert.deepEqual(rank("zzzzzz").entries, []);
});

test("ranking never mutates the entries it was given", () => {
  const before = JSON.stringify(BASE.map(({ run: _run, ...rest }) => rest));
  rank("restart");
  assert.equal(JSON.stringify(BASE.map(({ run: _run, ...rest }) => rest)), before);
});
