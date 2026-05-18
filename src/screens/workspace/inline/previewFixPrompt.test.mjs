import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

async function loadPreviewFixPrompt() {
  const source = await readFile(new URL("./previewFixPrompt.ts", import.meta.url), "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }
  }).outputText;
  const module = { exports: {} };
  new Function("exports", "module", output)(module.exports, module);
  return module.exports;
}

test("desktop project preview fix prompt targets existing project files", async () => {
  const { buildFixPrompt } = await loadPreviewFixPrompt();
  const prompt = buildFixPrompt({
    id: "desktop-preview-project",
    projectId: "project-1",
    source: "desktop",
    title: "HongKongExpress-new",
    url: "http://127.0.0.1:4317/preview/server/project/token/login"
  }, [{
    type: "resource",
    message: "Preview request failed: HTTP 419",
    source: "http://127.0.0.1:4317/preview/server/project/token/login",
    stack: "<!doctype html><html><head><title>Page Expired</title><script>window.__vibyraPreviewRuntimeErrorOverlay=true</script></head><body><h1>Page Expired</h1><p>CSRF token mismatch.</p></body></html>"
  }]);

  assert.match(prompt, /Fix the selected project files/);
  assert.match(prompt, /Do not return a self-contained <vibyra-app>/);
  assert.match(prompt, /Do not create an unrelated root index\.html/);
  assert.match(prompt, /Laravel\/Inertia HTTP 419/);
  assert.match(prompt, /Vibyra Desktop preview proxy route/);
  assert.match(prompt, /\/preview\/server\/\{project\}\/\{token\}\//);
  assert.match(prompt, /Do not patch unrelated project code/);
  assert.match(prompt, /CSRF token mismatch/);
  assert.doesNotMatch(prompt, /Return a corrected complete self-contained <vibyra-app>/);
  assert.doesNotMatch(prompt, /__vibyraPreviewRuntimeErrorOverlay/);
  assert.doesNotMatch(prompt, /<script/);
});

test("generated preview fix prompt keeps self-contained vibyra app contract", async () => {
  const { buildFixPrompt } = await loadPreviewFixPrompt();
  const prompt = buildFixPrompt({
    id: "generated-preview",
    source: "generated",
    title: "Generated Todo",
    html: "<!doctype html><html><body><button>Save</button><script>throw new Error('broken')</script></body></html>"
  }, [{
    type: "error",
    message: "broken",
    stack: "Error: broken"
  }]);

  assert.match(prompt, /Return a corrected complete self-contained <vibyra-app>/);
  assert.match(prompt, /Current generated preview HTML/);
  assert.doesNotMatch(prompt, /Do not return a self-contained <vibyra-app>/);
  assert.doesNotMatch(prompt, /Do not create an unrelated root index\.html/);
});

test("preview modal imports the dedicated fix prompt builder", async () => {
  const source = await readFile(new URL("./AppPreviewModal.tsx", import.meta.url), "utf8");
  assert.match(source, /from "\.\/previewFixPrompt"/);
  assert.doesNotMatch(source, /buildFixPrompt } from "\.\/AppPreviewErrorPanel"/);
});
