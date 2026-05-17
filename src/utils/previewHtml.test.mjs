import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

async function loadPreviewHtml() {
  const source = await readFile(new URL("./previewHtml.ts", import.meta.url), "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }
  }).outputText;
  const module = { exports: {} };
  new Function("exports", "module", output)(module.exports, module);
  return module.exports;
}

test("source-only Vite HTML is not treated as self-contained phone preview HTML", async () => {
  const { hasLocalPreviewDependencies } = await loadPreviewHtml();
  assert.equal(hasLocalPreviewDependencies('<script type="module" src="/resources/js/app.tsx"></script>'), true);
  assert.equal(hasLocalPreviewDependencies('<script type="module" src="/src/main.jsx"></script>'), true);
  assert.equal(hasLocalPreviewDependencies('<link rel="stylesheet" href="/style.css">'), true);
  assert.equal(hasLocalPreviewDependencies("<!doctype html><html><body><script>console.log('inline')</script></body></html>"), false);
});
