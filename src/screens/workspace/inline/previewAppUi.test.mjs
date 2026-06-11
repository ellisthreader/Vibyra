import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

async function loadFingerprint() {
  const source = await readFile(new URL("./previewAppFingerprint.ts", import.meta.url), "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }
  }).outputText;
  const module = { exports: {} };
  new Function("exports", "module", output)(module.exports, module);
  return module.exports.previewAppFingerprint;
}

test("preview fingerprint changes when same-length HTML content changes", async () => {
  const fingerprint = await loadFingerprint();
  const first = fingerprint({ id: "app", title: "App", html: "<p>one</p>" });
  const second = fingerprint({ id: "app", title: "App", html: "<p>two</p>" });
  assert.notEqual(first, second);
});

test("preview mini chat keeps failed submissions available for retry", async () => {
  const source = await readFile(new URL("./AppPreviewMiniChat.tsx", import.meta.url), "utf8");
  assert.match(source, /useMemo\(\(\) => previewAppFingerprint\(app\), \[app\.html, app\.id, app\.url\]\)/);
  assert.match(source, /const submitted = await onSubmit\(prompt\);[\s\S]*if \(submitted\) setDraft\(""\)/);
  assert.doesNotMatch(source, /setSubmitting\(true\);\s*setDraft\(""\)/);
  assert.match(source, /keep the user's draft for retry/);
});
