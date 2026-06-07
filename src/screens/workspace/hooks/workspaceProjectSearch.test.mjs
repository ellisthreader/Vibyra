import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const { projectMatchesSearch } = await loadCommonJs("./workspaceProjectSearch.ts");

test("matches a valid project field when sibling payload fields are null", () => {
  assert.equal(projectMatchesSearch({
    name: "Vibyra Mobile",
    path: null,
    stack: null
  }, "mobile"), true);
});

test("matches desktop folders by path when name and stack are null", () => {
  assert.equal(projectMatchesSearch({
    name: null,
    path: "/Users/ellis/Desktop/SaaS",
    stack: null
  }, "desktop"), true);
});

test("does not crash or match when all searchable payload fields are null", () => {
  assert.equal(projectMatchesSearch({
    name: null,
    path: null,
    stack: null
  }, "vibyra"), false);
});

test("keeps malformed entries visible when search is empty", () => {
  assert.equal(projectMatchesSearch({
    name: null,
    path: null,
    stack: null
  }, ""), true);
});

async function loadCommonJs(relativePath) {
  const source = await readFile(new URL(relativePath, import.meta.url), "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }
  }).outputText;
  const module = { exports: {} };
  new Function("exports", "module", output)(module.exports, module);
  return module.exports;
}
