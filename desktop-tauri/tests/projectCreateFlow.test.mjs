import assert from "node:assert/strict";
import test from "node:test";

import {
  kindForTemplate,
  RAIL,
  stepAfterKind,
  stepAfterStack,
} from "../src/lib/projectCreateFlow.ts";
import { PROJECT_KINDS } from "../src/lib/projectTemplateKinds.ts";

test("skipping the kind question lands on naming, not on a follow-up", () => {
  assert.equal(stepAfterKind(null), "where");
});

test("an empty project has nothing left to choose", () => {
  assert.equal(stepAfterKind("empty"), "where");
});

test("every other kind asks which stack", () => {
  for (const kind of PROJECT_KINDS) {
    if (kind.id === "empty") continue;
    assert.equal(stepAfterKind(kind.id), "stack", kind.id);
  }
});

test("skipping the stack question also lands on naming", () => {
  assert.equal(stepAfterStack(null), "where");
});

test("options are only asked about when the template runs something", () => {
  assert.equal(stepAfterStack("next"), "options");
  assert.equal(stepAfterStack("godot"), "where", "a seeded template has no options");
  assert.equal(stepAfterStack("empty"), "where");
});

test("the progress rail covers the questions and nothing else", () => {
  assert.deepEqual(RAIL, ["kind", "stack", "options", "where"]);
  assert.ok(!RAIL.includes("start"));
  assert.ok(!RAIL.includes("running"));
});

test("browsing keeps the kind you picked when the stack is filed under it too", () => {
  // Next.js is both a website and a web app: choosing it from Web app must not
  // relabel the project a Website.
  assert.equal(kindForTemplate("webapp", "next"), "webapp");
  assert.equal(kindForTemplate("website", "next"), "website");
});

test("browsing away from a kind relabels rather than lying", () => {
  // Picking Next.js from inside Game must never print "Making: Game".
  assert.equal(kindForTemplate("game", "next"), "website");
  assert.equal(kindForTemplate("website", "godot"), "game");
});

test("an unknown or skipped stack leaves the kind alone", () => {
  assert.equal(kindForTemplate("game", null), "game");
  assert.equal(kindForTemplate("game", "nothing-here"), "game");
  assert.equal(kindForTemplate(null, "next"), "website");
});
