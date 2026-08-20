import assert from "node:assert/strict";
import test from "node:test";

import {
  clampCompanionWidth,
  restoreCompanionTab,
  restoreCompanionWidth,
  saveCompanionTab,
  saveCompanionWidth,
} from "../src/lib/companionPreferences.ts";
import { visibleFileEntries } from "../src/lib/fileTreePolicy.ts";
import { formatMemoryContext, mergeImportedMemory } from "../src/lib/memoryImport.ts";
import { parseMemoryDocument } from "../src/lib/memoryDocument.ts";
import { buildMemoryTree, resolveMemoryLink, searchMemoryPaths } from "../src/lib/memoryTree.ts";

function memoryStorage(seed = {}) {
  const values = new Map(Object.entries(seed));
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    values,
  };
}

function entry(name, isDir) {
  return { name, isDir, path: `/project/${name}`, size: 0, modifiedMs: null };
}

test("clamps and persists the companion width without accepting stale values", () => {
  assert.equal(clampCompanionWidth(240), 300);
  assert.equal(clampCompanionWidth(420.4), 420);
  assert.equal(clampCompanionWidth(900), 520);

  assert.equal(restoreCompanionWidth(memoryStorage()), 360);

  const storage = memoryStorage({ "vibyra.desktop.companionWidth": "900" });
  assert.equal(restoreCompanionWidth(storage), 520);
  saveCompanionWidth(344, storage);
  assert.equal(storage.values.get("vibyra.desktop.companionWidth"), "344");
});

test("restores only known companion tools", () => {
  const storage = memoryStorage({ "vibyra.desktop.companionTab": "memory" });
  assert.equal(restoreCompanionTab(storage), "memory");
  saveCompanionTab("files", storage);
  assert.equal(restoreCompanionTab(storage), "files");
  storage.values.set("vibyra.desktop.companionTab", "dashboard");
  assert.equal(restoreCompanionTab(storage), "chat");
});

test("keeps generated folders quiet while preserving normal project navigation", () => {
  const entries = [
    entry("src", true),
    entry("node_modules", true),
    entry("dist", true),
    entry("App.tsx", false),
    entry("README.md", false),
  ];
  assert.deepEqual(
    visibleFileEntries(entries, { query: "", showGenerated: false }).map(({ name }) => name),
    ["src", "App.tsx", "README.md"],
  );
  assert.deepEqual(
    visibleFileEntries(entries, { query: "app", showGenerated: false }).map(({ name }) => name),
    ["src", "App.tsx"],
  );
  assert.equal(
    visibleFileEntries(entries, { query: "", showGenerated: true }).length,
    entries.length,
  );
});

test("imports selected notes into editable project memory without source paths", () => {
  const merged = mergeImportedMemory("# Project\n\nKeep this.", [
    { name: "decisions.md", content: "# Decisions\n\nUse the native shell." },
    { name: "empty.md", content: "   " },
  ]);
  assert.match(merged, /^# Project/);
  assert.match(merged, /## Imported · decisions\.md/);
  assert.doesNotMatch(merged, /empty\.md/);
  assert.doesNotMatch(merged, /\/home\//);
});

test("labels editable and read-only memory context separately", () => {
  const context = formatMemoryContext("# Local rule", [
    { path: "Architecture/Terminal.md", content: "PTY sessions persist." },
  ]);
  assert.match(context, /editable MEMORY\.md/);
  assert.match(context, /read-only notes selected locally/);
  assert.match(context, /Architecture\/Terminal\.md/);
});

test("builds a stable Obsidian-style note tree without loading note bodies", () => {
  const tree = buildMemoryTree([
    "Decisions.md",
    "Architecture/Terminal.md",
    "Architecture/Desktop.md",
  ]);
  assert.equal(tree[0].kind, "folder");
  assert.equal(tree[0].name, "Architecture");
  assert.deepEqual(tree[0].children.map(({ name }) => name), ["Desktop", "Terminal"]);
  assert.deepEqual(searchMemoryPaths(["Architecture/Terminal.md"], "term"), [
    "Architecture/Terminal.md",
  ]);
  assert.equal(
    resolveMemoryLink(["Architecture/Terminal.md"], "Terminal"),
    "Architecture/Terminal.md",
  );
});

test("parses a safe readable memory document and unique outline anchors", () => {
  const model = parseMemoryDocument("# Project\n\n## Rules\n- Fast\n- Clear\n\n## Rules\n```ts\nrun();\n```");
  assert.deepEqual(model.headings.map(({ id }) => id), ["project", "rules", "rules-2"]);
  assert.equal(model.blocks.find(({ kind }) => kind === "list")?.items.length, 2);
  assert.equal(model.blocks.find(({ kind }) => kind === "code")?.language, "ts");
});
