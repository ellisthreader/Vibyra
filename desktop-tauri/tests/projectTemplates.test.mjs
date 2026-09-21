import assert from "node:assert/strict";
import test from "node:test";

import { PROJECT_KINDS } from "../src/lib/projectTemplateKinds.ts";
import {
  additionsFor, allRequiredTools, canLayer, hasInstallStep, missingTools,
  PROJECT_TEMPLATES, templateById, templatesForKind,
} from "../src/lib/projectTemplates.ts";
import { buildScaffoldRequest, describeSteps } from "../src/lib/projectTemplateCommand.ts";
import {
  defaultParent, expandHome, joinPath, parentOf, pascalCase, resolveDestination, slugify, suggestedName,
} from "../src/lib/projectDestination.ts";
import { searchTemplates, templateScore } from "../src/lib/projectStackSearch.ts";
import { kindForTemplate, stepAfterKind, stepAfterStack } from "../src/lib/projectCreateFlow.ts";

const OPTIONS = { install: true, git: true, openTerminal: true };

/** Every tool id is an executable name, because preflight is a PATH lookup and
 *  nothing more. A `requires` naming something else disables a row forever. */
const TOOLS = new Set(["node", "npm", "npx", "git", "cargo", "go", "python3", "composer", "rails", "flutter"]);

test("catalog ids are unique and every kind has somewhere to go", () => {
  const ids = PROJECT_TEMPLATES.map((entry) => entry.id);
  assert.equal(new Set(ids).size, ids.length, "duplicate template id");
  for (const kind of PROJECT_KINDS) {
    assert.ok(templatesForKind(kind.id).length > 0, `${kind.id} has no stack`);
  }
});

test("every required tool is an executable preflight can look up", () => {
  for (const entry of PROJECT_TEMPLATES) {
    for (const tool of entry.requires) {
      assert.ok(TOOLS.has(tool), `${entry.id} requires unknown tool ${tool}`);
    }
  }
  for (const tool of allRequiredTools()) assert.ok(TOOLS.has(tool));
});

/**
 * The single biggest correctness risk. The runner gives a step no TTY, so a
 * scaffolder that stops to ask a question hangs until the stall guard kills it
 * — which reads as a broken template rather than a missing flag.
 */
test("every scaffolder is driven non-interactively", () => {
  /** Flags that turn a scaffolder's questions off. */
  const NON_INTERACTIVE = ["--yes", "-y", "--no-interaction", "--defaults", "--template", "--skip-houston"];
  /** Scaffolders that take every answer from argv and never prompt. Each was
   *  checked against its own CLI rather than assumed. */
  const SILENT = new Set(["cargo new", "flutter create", "go mod", "python3 -m", "rails new"]);
  for (const entry of PROJECT_TEMPLATES) {
    for (const step of entry.steps) {
      if (step.cwd !== "parent") continue;
      const argv = step.args.join(" ");
      const head = `${step.program} ${step.args.slice(0, 2).join(" ")}`;
      assert.ok(
        NON_INTERACTIVE.some((flag) => step.args.includes(flag))
          || [...SILENT].some((safe) => head.startsWith(safe)),
        `${entry.id} step "${step.label}" may stop to ask a question: ${step.program} ${argv}`,
      );
    }
  }
});

test("a template either runs something or writes something", () => {
  for (const entry of PROJECT_TEMPLATES) {
    if (entry.id === "empty") continue;
    assert.ok(entry.steps.length > 0 || entry.seeds.length > 0, `${entry.id} does nothing`);
  }
});

/** Two scaffolders that both expect to own an empty folder is the second one
 *  failing on the first one's files, so only one of them may ever be picked. */
test("only steps that run inside the project can be layered", () => {
  for (const entry of PROJECT_TEMPLATES) {
    if (!canLayer(entry)) continue;
    assert.ok(entry.steps.every((step) => step.cwd === "project"), `${entry.id} cannot layer`);
  }
  assert.equal(canLayer(templateById("next")), false, "Next.js makes its own folder");
  assert.equal(canLayer(templateById("express")), true, "Express only adds files");
  assert.equal(canLayer(templateById("empty")), false, "the empty folder is not an addition");
});

test("additions are layerable and filed under another question", () => {
  const additions = additionsFor("webapp", "next");
  assert.ok(additions.length > 0);
  for (const entry of additions) {
    assert.ok(canLayer(entry));
    assert.ok(!entry.kinds.includes("webapp"), `${entry.id} is already a web app stack`);
    assert.notEqual(entry.id, "next");
  }
});

test("the name becomes the folder, and an identifier where one is needed", () => {
  assert.equal(slugify("My Next Project!"), "my-next-project");
  assert.equal(slugify("  ---  "), "");
  assert.equal(slugify("Ünïcôde Ápp"), "unicode-app");
  assert.equal(pascalCase("my next project"), "MyNextProject");
  assert.equal(pascalCase("2048 game"), "App2048Game", "React Native rejects a leading digit");
});

test("paths resolve without leaving the folder that was chosen", () => {
  assert.equal(expandHome("~/Projects", "/Users/x"), "/Users/x/Projects");
  assert.equal(expandHome("~", "/Users/x"), "/Users/x");
  assert.equal(expandHome("/tmp/here", "/Users/x"), "/tmp/here");
  assert.equal(joinPath("/a/b/", "c"), "/a/b/c");
  assert.equal(parentOf("/a/b/c"), "/a/b");

  assert.equal(resolveDestination("~/Projects", "My App", "/Users/x").path, "/Users/x/Projects/my-app");
  assert.match(resolveDestination("relative", "App", "/Users/x").error, /folder/);
  assert.match(resolveDestination("/a", "", "/Users/x").error, /name/);
  assert.match(resolveDestination("/a", "!!!", "/Users/x").error, /letters or numbers/);
});

test("new projects land beside the ones that already exist", () => {
  const roots = ["/Users/x/code/one", "/Users/x/code/two", "/Users/x/Desktop/three"];
  assert.equal(defaultParent(roots, "/Users/x"), "/Users/x/code");
  assert.equal(defaultParent([], "/Users/x"), "/Users/x/Projects");
  assert.equal(suggestedName(roots, "/Users/x/code"), "untitled");
  assert.equal(suggestedName(["/Users/x/code/untitled"], "/Users/x/code"), "untitled-2");
});

test("a plan runs the name that was typed, never the text", () => {
  const entry = templateById("vite-react");
  const request = buildScaffoldRequest(entry, "/Users/x/code/my-app", OPTIONS);
  assert.equal(request.dir, "/Users/x/code/my-app");
  assert.equal(request.createDir, false, "npm create makes the folder itself");
  assert.ok(request.steps[0].args.includes("my-app"));
  assert.equal(request.steps[0].cwd, "/Users/x/code", "a parent step runs beside the folder");
  // Steps are argv, so a name can never become a command however it is spelled.
  for (const step of request.steps) assert.ok(Array.isArray(step.args));
});

test("turning dependencies off drops only the install steps", () => {
  const entry = templateById("vite-react");
  assert.equal(hasInstallStep(entry), true);
  const off = buildScaffoldRequest(entry, "/a/b", { ...OPTIONS, install: false });
  assert.ok(off.steps.every((step) => !step.label.startsWith("Installing")));
  assert.ok(buildScaffoldRequest(entry, "/a/b", OPTIONS).steps.length > off.steps.length);
});

test("a layered stack follows the base into the folder it made", () => {
  const request = buildScaffoldRequest(templateById("next"), "/a/my-app", OPTIONS, [templateById("express")]);
  assert.ok(request.seeds.some((seed) => seed.path === "index.js"), "the extra's seeds are written");
  assert.ok(request.seeds.every((seed) => !seed.path.includes("..")), "no seed escapes the project");
  assert.ok(request.seeds.some((seed) => seed.body.includes("my-app")), "{{name}} is filled in");
  const inside = request.steps.filter((step) => step.cwd === "/a/my-app");
  assert.ok(inside.length > 0);
});

test("the setup screen shows exactly what will be run", () => {
  const request = buildScaffoldRequest(templateById("expo"), "/a/my-app", OPTIONS);
  const shown = describeSteps(request);
  assert.ok(shown[0].startsWith("npx "));
  assert.ok(shown[0].includes("my-app"));
  // `git init` is the computer's own step rather than the template's, but a
  // switch that is on has to appear in the list it is shown beside.
  assert.equal(shown.length, request.steps.length + 1);
  assert.equal(shown.at(-1), "git init");
  assert.ok(!describeSteps(buildScaffoldRequest(templateById("expo"), "/a/my-app", { ...OPTIONS, git: false }))
    .includes("git init"));
});

test("an empty project is a folder and nothing else", () => {
  const request = buildScaffoldRequest(templateById("empty"), "/a/b", OPTIONS);
  assert.equal(request.steps.length, 0);
  assert.equal(request.seeds.length, 0);
  assert.equal(request.createDir, true);
  assert.deepEqual(describeSteps(request), ["git init"]);
  assert.deepEqual(describeSteps(buildScaffoldRequest(templateById("empty"), "/a/b", { ...OPTIONS, git: false })), []);
});

test("search finds a stack by name, by kind and by plain word", () => {
  assert.equal(searchTemplates("")[0].id, PROJECT_TEMPLATES[0].id, "no query is the whole catalog in order");
  assert.equal(searchTemplates("next")[0].id, "next");
  assert.ok(searchTemplates("phone").some((entry) => entry.id === "expo"));
  assert.ok(searchTemplates("api").some((entry) => entry.id === "axum"));
  assert.equal(searchTemplates("zzzz").length, 0);
  assert.ok(templateScore(templateById("next"), "next") > templateScore(templateById("nest"), "next"));
});

test("a missing toolchain blocks a row, an unanswered preflight does not", () => {
  const entry = templateById("flutter");
  assert.deepEqual(missingTools(entry, {}), [], "nothing is missing until Rust has answered");
  assert.deepEqual(missingTools(entry, { flutter: false }), ["flutter"]);
  assert.deepEqual(missingTools(entry, { flutter: true }), []);
});

/** Skipping a question never asks a follow-up, and every path reaches a folder. */
test("the skip contract holds from every question", () => {
  assert.equal(stepAfterKind(null), "where");
  assert.equal(stepAfterKind("empty"), "where");
  assert.equal(stepAfterKind("mobile"), "stack");
  assert.equal(stepAfterStack(), "where");
});

test("browsing to a stack filed elsewhere relabels the kind", () => {
  assert.equal(kindForTemplate("game", "next"), "website", "Next.js is not a game");
  assert.equal(kindForTemplate("website", "next"), "website", "a kind it covers is kept");
  assert.equal(kindForTemplate("game", null), "game", "skipping keeps the answer");
});
