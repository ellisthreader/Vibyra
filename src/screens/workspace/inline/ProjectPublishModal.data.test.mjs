import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

async function loadData() {
  const source = await readFile(new URL("./ProjectPublishModal.data.ts", import.meta.url), "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }
  }).outputText;
  const module = { exports: {} };
  const require = (specifier) => {
    if (specifier === "@expo/vector-icons") return { Ionicons: { glyphMap: {} } };
    throw new Error(`Unexpected import ${specifier}`);
  };
  new Function("require", "exports", "module", output)(require, module.exports, module);
  return module.exports;
}

test("publish visibility selector exposes only public and private", async () => {
  const { VISIBILITY_OPTIONS } = await loadData();
  assert.deepEqual(VISIBILITY_OPTIONS.map((option) => option.key), ["public", "private"]);
  assert.equal(VISIBILITY_OPTIONS.some((option) => /link/i.test(option.copy)), false);
});

test("dirty listing forms ignore same-project status hydration", async () => {
  const { shouldHydratePublishForm } = await loadData();
  assert.equal(shouldHydratePublishForm("project-1", "project-1", true), false);
  assert.equal(shouldHydratePublishForm("project-1", "project-1", false), true);
  assert.equal(shouldHydratePublishForm("project-1", "project-2", true), true);
});
