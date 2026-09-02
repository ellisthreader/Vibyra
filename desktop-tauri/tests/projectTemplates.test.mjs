import assert from "node:assert/strict";
import test from "node:test";

import { PROJECT_KINDS } from "../src/lib/projectTemplateKinds.ts";
import {
  allRequiredTools,
  hasInstallStep,
  PROJECT_TEMPLATES,
  templateById,
  templatesForKind,
} from "../src/lib/projectTemplates.ts";

const KNOWN_TOOLS = new Set([
  "node", "npm", "npx", "git", "cargo", "go", "python3", "composer", "rails", "flutter",
]);

// A scaffolder with no TTY that is asked a question hangs rather than fails,
// so every catalogued command must be non-interactive by construction.
const NON_INTERACTIVE = [
  "--yes", "-y", "--defaults", "--skip-install", "--no-install", "--template",
  "--skip-git", "--no-add-ons", "--skip-git-init", "--skip-bundle", "--skip-houston",
];

test("template ids are unique", () => {
  const ids = PROJECT_TEMPLATES.map((entry) => entry.id);
  assert.equal(new Set(ids).size, ids.length);
});

test("every kind offers at least one stack", () => {
  for (const kind of PROJECT_KINDS) {
    assert.ok(templatesForKind(kind.id).length > 0, `${kind.id} has no stacks`);
  }
});

test("every template either runs something or writes something", () => {
  for (const entry of PROJECT_TEMPLATES) {
    if (entry.id === "empty") continue;
    assert.ok(
      entry.steps.length > 0 || entry.seeds.length > 0,
      `${entry.id} would create an empty folder`,
    );
  }
});

test("every scaffolding command is non-interactive", () => {
  for (const entry of PROJECT_TEMPLATES) {
    for (const step of entry.steps) {
      // The prompting ones are the npm/npx project generators. Toolchain
      // binaries — cargo, go, git, python3, flutter — never stop to ask.
      const generator =
        ["npm", "npx"].includes(step.program) &&
        ["create", "new", "init"].some((verb) => step.args.includes(verb));
      if (!generator) continue;
      assert.ok(
        step.args.some((arg) => NON_INTERACTIVE.some((flag) => arg.startsWith(flag))),
        `${entry.id}: "${step.program} ${step.args.join(" ")}" could stop and ask`,
      );
    }
  }
});

test("every required tool is one preflight knows how to look for", () => {
  for (const entry of PROJECT_TEMPLATES) {
    for (const tool of entry.requires) {
      assert.ok(KNOWN_TOOLS.has(tool), `${entry.id} requires unknown tool ${tool}`);
    }
  }
  for (const tool of allRequiredTools()) assert.ok(KNOWN_TOOLS.has(tool));
});

test("a template that needs a toolchain says where to get it", () => {
  for (const entry of PROJECT_TEMPLATES) {
    if (entry.requires.length === 0) continue;
    assert.match(entry.docs, /^https:\/\//, `${entry.id} has no install link`);
  }
});

test("no step runs through a shell", () => {
  for (const entry of PROJECT_TEMPLATES) {
    for (const step of entry.steps) {
      assert.ok(!/[;&|><`$]/.test(step.program), `${entry.id} program looks like a shell line`);
      for (const arg of step.args) {
        assert.ok(!/[;&|`]/.test(arg), `${entry.id} argument looks like a shell line`);
      }
    }
  }
});

test("the dependencies toggle only shows where it means something", () => {
  assert.equal(hasInstallStep(templateById("next")), true);
  assert.equal(hasInstallStep(templateById("flutter")), false);
  assert.equal(templateById("nothing-here"), null);
});
