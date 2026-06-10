import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

async function loadPublicDemoUrls() {
  const sourcePath = new URL("./publicDemoUrls.ts", import.meta.url);
  const source = await readFile(sourcePath, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }
  }).outputText;
  const module = { exports: {} };
  new Function("exports", "module", output)(module.exports, module);
  return module.exports;
}

test("public demo URL sanitizer accepts hosted HTTPS URLs", async () => {
  const { sanitizePublicDemoUrl } = await loadPublicDemoUrls();
  assert.equal(
    sanitizePublicDemoUrl("https://vibyra-production.up.railway.app/demo"),
    "https://vibyra-production.up.railway.app/demo"
  );
});

test("public demo URL sanitizer rejects private and local URLs", async () => {
  const { publicDemoUrlBlockedReason, sanitizePublicDemoUrl } = await loadPublicDemoUrls();
  for (const url of [
    "http://192.168.1.109:8000",
    "https://10.0.0.4/demo",
    "https://172.16.0.8/demo",
    "https://127.0.0.1:8000",
    "https://localhost:8000",
    "https://my-mac.local/demo"
  ]) {
    assert.equal(sanitizePublicDemoUrl(url), undefined);
    assert.match(publicDemoUrlBlockedReason(url), /private|local|HTTPS/);
  }
});

test("public demo URL selection skips blocked URLs", async () => {
  const { firstPublicDemoUrl } = await loadPublicDemoUrls();
  assert.equal(
    firstPublicDemoUrl(["http://192.168.1.109:8000", "https://vibyra-demo.up.railway.app/app"]),
    "https://vibyra-demo.up.railway.app/app"
  );
});

test("public demo URL sanitizer rejects unapproved origins and credentialed URLs", async () => {
  const { publicDemoUrlBlockedReason, sanitizePublicDemoUrl } = await loadPublicDemoUrls();
  for (const url of [
    "https://example.com/app",
    "https://user:secret@vibyra-demo.up.railway.app/app",
    "https://vibyra-demo.up.railway.app:8443/app"
  ]) {
    assert.equal(sanitizePublicDemoUrl(url), undefined);
    assert.match(publicDemoUrlBlockedReason(url), /approved|credentials|port/);
  }
});

test("configured public demo hosts are accepted without allowing sibling domains", async () => {
  const previous = process.env.EXPO_PUBLIC_DEMO_HOSTS;
  process.env.EXPO_PUBLIC_DEMO_HOSTS = "demos.vibyra.app,*.apps.vibyra.app";
  try {
    const { sanitizePublicDemoUrl } = await loadPublicDemoUrls();
    assert.equal(sanitizePublicDemoUrl("https://demos.vibyra.app/app"), "https://demos.vibyra.app/app");
    assert.equal(sanitizePublicDemoUrl("https://one.apps.vibyra.app/app"), "https://one.apps.vibyra.app/app");
    assert.equal(sanitizePublicDemoUrl("https://apps.vibyra.app/app"), undefined);
    assert.equal(sanitizePublicDemoUrl("https://evilvibyra.app/app"), undefined);
  } finally {
    if (previous === undefined) delete process.env.EXPO_PUBLIC_DEMO_HOSTS;
    else process.env.EXPO_PUBLIC_DEMO_HOSTS = previous;
  }
});

test("public demo URL selection returns nothing for empty or blocked candidates", async () => {
  const { firstPublicDemoUrl, publicDemoUrlBlockedReason, sanitizePublicDemoUrl } = await loadPublicDemoUrls();
  assert.equal(sanitizePublicDemoUrl(""), undefined);
  assert.equal(publicDemoUrlBlockedReason(""), "");
  assert.equal(
    firstPublicDemoUrl([undefined, null, "", "http://192.168.1.109:8000"]),
    undefined
  );
});

test("public demo URL sanitizer allows first-party local community demo routes only in dev", async () => {
  const { sanitizePublicDemoUrl } = await loadPublicDemoUrls();
  assert.equal(sanitizePublicDemoUrl("http://192.168.1.109:8000/api/community/projects/azureproject/demo"), undefined);
  const previous = globalThis.__DEV__;
  globalThis.__DEV__ = true;
  try {
    assert.equal(
      sanitizePublicDemoUrl("http://192.168.1.109:8000/api/community/projects/azureproject/demo"),
      "http://192.168.1.109:8000/api/community/projects/azureproject/demo"
    );
    assert.equal(
      sanitizePublicDemoUrl("http://192.168.1.109:8000/api/community/projects/azureproject/preview"),
      "http://192.168.1.109:8000/api/community/projects/azureproject/preview"
    );
    assert.equal(sanitizePublicDemoUrl("http://192.168.1.109:8000/not-a-demo"), undefined);
  } finally {
    if (previous === undefined) delete globalThis.__DEV__;
    else globalThis.__DEV__ = previous;
  }
});
