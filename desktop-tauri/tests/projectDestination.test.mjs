import assert from "node:assert/strict";
import test from "node:test";

import {
  defaultParent,
  expandHome,
  joinPath,
  parentOf,
  pascalCase,
  resolveDestination,
  slugify,
  suggestedName,
} from "../src/lib/projectDestination.ts";

const project = (root) => ({ id: root, name: root, root, color: "#fff", lastOpenedMs: 0 });

test("a typed name becomes a folder name", () => {
  assert.equal(slugify("My Cool App"), "my-cool-app");
  assert.equal(slugify("  Spaces  and__underscores "), "spaces-and-underscores");
  assert.equal(slugify("Ünïcodé!!"), "unicode");
  assert.equal(slugify("!!!"), "");
  assert.equal(slugify("a".repeat(80)).length, 48);
});

test("React Native's identifier form never starts with a digit", () => {
  assert.equal(pascalCase("my cool app"), "MyCoolApp");
  assert.equal(pascalCase("2048 game"), "App2048Game");
});

test("~ expands, and only at the front", () => {
  assert.equal(expandHome("~/code", "/home/e"), "/home/e/code");
  assert.equal(expandHome("~", "/home/e"), "/home/e");
  assert.equal(expandHome("/opt/~/x", "/home/e"), "/opt/~/x");
});

test("paths join and split without doubling separators", () => {
  assert.equal(joinPath("/home/e/", "app"), "/home/e/app");
  assert.equal(parentOf("/home/e/app/"), "/home/e");
  assert.equal(parentOf("/app"), "/");
});

test("the default parent is wherever the other projects live", () => {
  const projects = [project("/home/e/code/a"), project("/home/e/code/b"), project("/home/e/x/c")];
  assert.equal(defaultParent(projects, "/home/e"), "/home/e/code");
  assert.equal(defaultParent([], "/home/e"), "/home/e/Projects");
  // A project sitting directly in $HOME says nothing about where new ones go.
  assert.equal(defaultParent([project("/home/e/loose")], "/home/e"), "/home/e/Projects");
});

test("the suggested name steps around projects already in that folder", () => {
  const projects = [project("/home/e/code/untitled"), project("/home/e/code/untitled-2")];
  assert.equal(suggestedName(projects, "/home/e/code"), "untitled-3");
  assert.equal(suggestedName(projects, "/home/e/other"), "untitled");
});

test("a destination resolves, or says why it cannot", () => {
  assert.deepEqual(resolveDestination("~/code", "My App", "/home/e"), {
    slug: "my-app",
    path: "/home/e/code/my-app",
    error: null,
  });
  assert.match(resolveDestination("~/code", "", "/home/e").error, /name/);
  assert.match(resolveDestination("~/code", "!!!", "/home/e").error, /letters/);
  assert.match(resolveDestination("relative", "app", "/home/e").error, /folder/);
});

test("a name cannot climb out of the folder it was given", () => {
  const { path } = resolveDestination("/home/e/code", "../../etc/passwd", "/home/e");
  assert.equal(path, "/home/e/code/etcpasswd");
});
