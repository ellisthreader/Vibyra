import assert from "node:assert/strict";
import test from "node:test";

import { buildScaffoldRequest, describeSteps } from "../src/lib/projectTemplateCommand.ts";
import { templateById } from "../src/lib/projectTemplates.ts";

const ALL = { install: true, git: true, openTerminal: true };
const NONE = { install: false, git: false, openTerminal: false };

test("the project name reaches every place the template asked for it", () => {
  const request = buildScaffoldRequest(templateById("next"), "/home/e/code/my-app", ALL);
  assert.deepEqual(request.steps[0].args.slice(0, 3), ["--yes", "create-next-app@latest", "my-app"]);
  assert.equal(request.dir, "/home/e/code/my-app");
});

test("React Native gets both forms of the name", () => {
  const request = buildScaffoldRequest(templateById("react-native"), "/home/e/my-cool-app", ALL);
  const args = request.steps[0].args;
  assert.ok(args.includes("MyCoolApp"), "the identifier form");
  assert.ok(args.includes("my-cool-app"), "the folder form");
  assert.ok(!args.some((arg) => arg.includes("{{")), "no token survives");
});

test("a scaffolder that makes its own folder runs beside it, not in it", () => {
  const request = buildScaffoldRequest(templateById("next"), "/home/e/code/app", ALL);
  assert.equal(request.steps[0].cwd, "/home/e/code");
  assert.equal(request.createDir, false, "the folder is left for create-next-app to make");
  assert.equal(request.steps[1].cwd, "/home/e/code/app", "npm install runs inside");
});

test("a seeded template owns its folder and gets it created first", () => {
  const request = buildScaffoldRequest(templateById("plain-html"), "/home/e/code/site", ALL);
  assert.equal(request.createDir, true);
  assert.equal(request.steps.length, 0);
  assert.deepEqual(request.seeds.map((seed) => seed.path), ["index.html", "styles.css", "main.js"]);
  assert.ok(request.seeds[0].body.includes("<title>site</title>"));
});

test("turning dependencies off drops the install steps and nothing else", () => {
  const on = buildScaffoldRequest(templateById("next"), "/home/e/app", ALL);
  const off = buildScaffoldRequest(templateById("next"), "/home/e/app", NONE);
  assert.equal(on.steps.length, 2);
  assert.equal(off.steps.length, 1);
  assert.equal(off.steps[0].label, on.steps[0].label);
});

test("git init follows the toggle", () => {
  assert.equal(buildScaffoldRequest(templateById("empty"), "/home/e/a", ALL).gitInit, true);
  assert.equal(buildScaffoldRequest(templateById("empty"), "/home/e/a", NONE).gitInit, false);
});

test("platform tokens are left for Rust, which knows where a venv lives", () => {
  const request = buildScaffoldRequest(templateById("fastapi"), "/home/e/api", ALL);
  assert.equal(request.steps[1].program, "{{venv}}/pip");
});

test("the review text quotes what a shell would need without ever using one", () => {
  const request = buildScaffoldRequest(templateById("next"), "/home/e/app", ALL);
  const [first] = describeSteps(request);
  assert.ok(first.startsWith("npx --yes create-next-app@latest app"));
  assert.ok(first.includes('"@/*"') === false, "no spaces means no quotes");
  const vite = describeSteps(buildScaffoldRequest(templateById("vite-react"), "/home/e/app", ALL));
  assert.equal(vite[0], "npm create vite@latest app -- --template react-ts");
});
