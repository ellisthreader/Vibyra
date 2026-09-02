import assert from "node:assert/strict";
import test from "node:test";

import { searchTemplates } from "../src/lib/projectStackSearch.ts";
import { PROJECT_TEMPLATES } from "../src/lib/projectTemplates.ts";

const ids = (query) => searchTemplates(query).map((entry) => entry.id);

test("an empty query is the whole catalog, in catalog order", () => {
  assert.deepEqual(searchTemplates(""), PROJECT_TEMPLATES);
  assert.deepEqual(searchTemplates("   "), PROJECT_TEMPLATES);
});

test("a name match comes first", () => {
  assert.equal(ids("next")[0], "next");
  assert.equal(ids("godot")[0], "godot");
  assert.equal(ids("laravel")[0], "laravel");
});

test("a stack is findable by the kind it is filed under", () => {
  assert.ok(ids("mobile").includes("expo"), "Expo is a mobile app");
  assert.ok(ids("game").includes("bevy"), "Bevy is a game engine");
  assert.ok(ids("ai app").includes("claude-node"));
});

test("a stack is findable by what its blurb says it does", () => {
  assert.ok(ids("dart").includes("flutter"));
  assert.ok(ids("tokio").includes("axum"));
  assert.ok(ids("typescript").includes("ts-library"));
});

test("a query nothing answers returns nothing rather than everything", () => {
  assert.deepEqual(searchTemplates("zzqq"), []);
});

test("a real hit outranks a scattered one", () => {
  // The palette's matcher is a subsequence match, so loose queries do find
  // things — what matters is that the thing you typed is first.
  assert.equal(ids("expo")[0], "expo");
  assert.equal(ids("rust")[0], "rust-cli");
});

test("every template is reachable from the browser", () => {
  // The whole point of Other…: no stack may be findable only through a kind.
  assert.equal(searchTemplates("").length, PROJECT_TEMPLATES.length);
  for (const entry of PROJECT_TEMPLATES) {
    assert.ok(ids(entry.name).includes(entry.id), `${entry.id} cannot find itself`);
  }
});
