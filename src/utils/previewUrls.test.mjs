import assert from "node:assert/strict";
import test from "node:test";
import { loadPreviewUrls, response } from "./previewUrls.testSupport.mjs";

test("desktop preview candidates rewrite dev-server ports onto known desktop hosts", async () => {
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

test("absolute preview candidates never receive the control bearer", async () => {
  const { desktopPreviewUrlCandidates } = await loadPreviewUrls();
  const target = "http://127.0.0.1:8000/";
  const candidates = desktopPreviewUrlCandidates({
    url: "http://192.168.1.20:4317",
    connectionUrls: ["http://10.0.0.9:4317"],
    token: "control-bearer-must-not-leak"
  }, target);
  assert.deepEqual(candidates, [target, "http://192.168.1.20:8000/", "http://10.0.0.9:8000/"]);
  assert.equal(candidates.some((candidate) => candidate.includes("control-bearer-must-not-leak")), false);
  assert.equal(candidates.some((candidate) => candidate.includes("/preview/proxy-url/")), false);
});

test("reachable preview resolution probes an absolute URL directly", async () => {
  const target = "http://127.0.0.1:8000/";
  const calls = [];
  const { resolveReachableDesktopPreviewUrl } = await loadPreviewUrls({
    fetchWithTimeout: async (url) => {
      calls.push(url);
      assert.equal(url, target);
      return response({ body: "<!doctype html><html><body>ready</body></html>", url });
    }
  });

  const resolved = await resolveReachableDesktopPreviewUrl({
    url: "http://192.168.1.20:4317",
    token: "control-bearer-must-not-leak"
  }, target);

  assert.equal(resolved, target);
  assert.deepEqual(calls, [target]);
});

test("relative scoped paths stay on remembered LAN bridge hosts", async () => {
  const { desktopPreviewUrlCandidates } = await loadPreviewUrls();
  const candidates = desktopPreviewUrlCandidates({
    url: "http://192.168.1.20:4317",
    connectionUrls: ["http://10.0.0.9:4317"],
    token: "control-bearer-must-not-leak"
  }, "/preview/project/app/preview-capability/");
  assert.deepEqual(candidates, [
    "http://192.168.1.20:4317/preview/project/app/preview-capability/",
    "http://10.0.0.9:4317/preview/project/app/preview-capability/"
  ]);
  assert.equal(candidates.some((candidate) => candidate.includes("control-bearer-must-not-leak")), false);
});

test("reachable preview resolution uses the LAN fallback", async () => {
  const calls = [];
  const okUrl = "http://192.168.1.20:5174/";
  const { resolveReachableDesktopPreviewUrl } = await loadPreviewUrls({
    fetchWithTimeout: async (url) => {
      calls.push(url);
      if (url !== okUrl) throw new Error("not reachable from phone");
      return response({ body: "<!doctype html><html><body>ready</body></html>", url });
    }
  });
  const resolved = await resolveReachableDesktopPreviewUrl({
    url: "http://192.168.1.20:4317",
    connectionUrls: ["http://10.0.0.9:4317"]
  }, "http://127.0.0.1:5174/");
  assert.equal(resolved, okUrl);
  assert.deepEqual(calls, ["http://127.0.0.1:5174/", okUrl]);
});
