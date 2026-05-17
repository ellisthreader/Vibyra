import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

function loadPreviewUrls(mockNetwork = {}) {
  const sourcePath = new URL("./previewUrls.ts", import.meta.url);
  return readFile(sourcePath, "utf8").then((source) => {
    const output = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }
    }).outputText;
    const module = { exports: {} };
    const network = {
      fetchWithTimeout: async () => { throw new Error("unexpected fetch"); },
      normalizeAgentUrl: (value) => {
        const trimmed = String(value ?? "").trim().replace(/\/+$/, "");
        return !trimmed ? "" : /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
      },
      ...mockNetwork
    };
    const require = (specifier) => {
      if (specifier === "./network") return network;
      throw new Error(`Unexpected import ${specifier}`);
    };
    new Function("require", "exports", "module", output)(require, module.exports, module);
    return module.exports;
  });
}

test("desktop preview URL candidates rewrite dev-server ports onto known desktop hosts", async () => {
  const { desktopPreviewUrlCandidates } = await loadPreviewUrls();
  assert.deepEqual(desktopPreviewUrlCandidates({
    url: "http://192.168.1.20:4317",
    connectionUrls: ["http://10.0.0.9:4317"]
  }, "http://127.0.0.1:5174/"), [
    "http://127.0.0.1:5174/",
    "http://192.168.1.20:5174/",
    "http://10.0.0.9:5174/"
  ]);
});

test("desktop preview URL candidates keep relative desktop preview paths on bridge hosts", async () => {
  const { desktopPreviewUrlCandidates } = await loadPreviewUrls();
  assert.deepEqual(desktopPreviewUrlCandidates({
    url: "http://192.168.1.20:4317",
    connectionUrls: ["http://10.0.0.9:4317"]
  }, "/preview/project/app/token/"), [
    "http://192.168.1.20:4317/preview/project/app/token/",
    "http://10.0.0.9:4317/preview/project/app/token/"
  ]);
});

test("reachable desktop preview resolution skips unreachable returned host and uses LAN fallback", async () => {
  const calls = [];
  const okUrl = "http://192.168.1.20:5174/";
  const { resolveReachableDesktopPreviewUrl } = await loadPreviewUrls({
    fetchWithTimeout: async (url) => {
      calls.push(url);
      if (url !== okUrl) throw new Error("not reachable from phone");
      return {
        headers: { get: () => "text/html; charset=utf-8" },
        ok: true,
        text: async () => "<!doctype html><html><body>ready</body></html>",
        url
      };
    }
  });
  const resolved = await resolveReachableDesktopPreviewUrl({
    url: "http://192.168.1.20:4317",
    connectionUrls: ["http://10.0.0.9:4317"]
  }, "http://127.0.0.1:5174/");
  assert.equal(resolved, okUrl);
  assert.deepEqual(calls, ["http://127.0.0.1:5174/", okUrl]);
});
