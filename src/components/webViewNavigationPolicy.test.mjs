import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

async function loadPolicy() {
  const source = await readFile(new URL("./webViewNavigationPolicy.ts", import.meta.url), "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }
  }).outputText;
  const module = { exports: {} };
  new Function("exports", "module", output)(module.exports, module);
  return module.exports;
}

test("URL previews allow only their exact origin", async () => {
  const { createWebViewNavigationPolicy, isWebViewNavigationAllowed } = await loadPolicy();
  const policy = createWebViewNavigationPolicy(undefined, "http://192.168.1.4:4317/preview/app");

  assert.equal(isWebViewNavigationAllowed(policy, "http://192.168.1.4:4317/next"), true);
  assert.equal(isWebViewNavigationAllowed(policy, "http://192.168.1.4:4318/next"), false);
  assert.equal(isWebViewNavigationAllowed(policy, "http://192.168.1.40:4317/next"), false);
  assert.equal(isWebViewNavigationAllowed(policy, "https://192.168.1.4:4317/next"), false);
});

test("navigation rejects credentials, dangerous schemes, and lookalikes", async () => {
  const { createWebViewNavigationPolicy, isWebViewNavigationAllowed } = await loadPolicy();
  const policy = createWebViewNavigationPolicy(undefined, "https://demo.vibyra.example/app");

  for (const candidate of [
    "https://user:secret@demo.vibyra.example/app",
    "https://demo.vibyra.example.evil.test/app",
    "javascript:alert(1)",
    "file:///etc/passwd",
    "content://settings",
    "intent://demo",
    "vibyra://reset-password"
  ]) {
    assert.equal(isWebViewNavigationAllowed(policy, candidate), false, candidate);
  }
});

test("inline previews allow about:blank operation only", async () => {
  const { createWebViewNavigationPolicy, isWebViewNavigationAllowed } = await loadPolicy();
  const policy = createWebViewNavigationPolicy("<html></html>", undefined);

  assert.equal(isWebViewNavigationAllowed(policy, "about:blank"), true);
  assert.equal(isWebViewNavigationAllowed(policy, "about:blank#section"), true);
  assert.equal(isWebViewNavigationAllowed(policy, "https://example.com"), false);
});

test("public demo policy requires hosted HTTPS and rejects inline HTML", async () => {
  const { createWebViewNavigationPolicy, isWebViewNavigationAllowed } = await loadPolicy();
  const inline = createWebViewNavigationPolicy("<script>alert(1)</script>", undefined, true);
  const cleartext = createWebViewNavigationPolicy(undefined, "http://demo.example/app", true);
  const hosted = createWebViewNavigationPolicy(undefined, "https://demo.example/app", true);

  assert.equal(isWebViewNavigationAllowed(inline, "about:blank"), false);
  assert.equal(isWebViewNavigationAllowed(cleartext, "http://demo.example/app"), false);
  assert.equal(isWebViewNavigationAllowed(hosted, "https://demo.example/next"), true);
  assert.equal(isWebViewNavigationAllowed(hosted, "https://other.example/next"), false);
});

test("native WebView keeps the hardened platform settings", async () => {
  const source = await readFile(new URL("./AppWebView.native.tsx", import.meta.url), "utf8");
  const publicSource = await readFile(new URL("./PublicDemoWebView.tsx", import.meta.url), "utf8");
  const communitySource = await readFile(
    new URL("../screens/workspace/inline/chunk15.tsx", import.meta.url),
    "utf8"
  );

  assert.match(source, /mixedContentMode="never"/);
  assert.match(source, /allowFileAccess=\{false\}/);
  assert.match(source, /allowFileAccessFromFileURLs=\{false\}/);
  assert.match(source, /allowUniversalAccessFromFileURLs=\{false\}/);
  assert.match(source, /sharedCookiesEnabled=\{false\}/);
  assert.match(source, /thirdPartyCookiesEnabled=\{false\}/);
  assert.match(source, /domStorageEnabled=\{!publicDemo\}/);
  assert.match(source, /incognito=\{publicDemo\}/);
  assert.match(source, /setSupportMultipleWindows=\{false\}/);
  assert.match(source, /onOpenWindow=\{\(\) => undefined\}/);
  assert.match(source, /onMessage=\{\(publicDemo/);
  assert.match(source, /PUBLIC_DEMO_ISOLATION_SCRIPT/);
  assert.doesNotMatch(publicSource, /html[?:=]/);
  assert.match(publicSource, /publicDemo/);
  assert.doesNotMatch(communitySource, /html=\{post\.previewHtml\}/);
  assert.match(communitySource, /return Boolean\(communityDemoUrl\(post\)\)/);
  assert.match(communitySource, /only includes an inline preview/);
});
