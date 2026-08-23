import assert from "node:assert/strict";
import test from "node:test";
import { loadPreviewUrls, response } from "./previewUrls.testSupport.mjs";

test("preflight allows Vite source-module failures for in-preview diagnostics", async () => {
  const rootUrl = "http://192.168.1.109:4317/preview/server/project/token/";
  const sourceUrl = "http://127.0.0.1:5175/resources/js/app.tsx";
  const scriptUrl = `${rootUrl.replace("server/project/", "proxy-url/")}?url=${encodeURIComponent(sourceUrl)}`;
  const { resolveRunnableDesktopPreviewUrl } = await loadPreviewUrls({
    fetchWithTimeout: async (url) => {
      if (url === rootUrl) return response({ body: `<script type="module" src="${scriptUrl}"></script>`, url });
      if (url === scriptUrl) return response({ ok: false, status: 500, body: "Vite transform failed", url });
      throw new Error(`Unexpected fetch ${url}`);
    }
  });
  assert.equal(await resolveRunnableDesktopPreviewUrl(rootUrl), rootUrl);
});

test("preflight allows scoped HTTP diagnostic pages", async () => {
  const rootUrl = "http://192.168.1.109:4317/preview/server/project/token/login";
  const { resolveRunnableDesktopPreviewUrl } = await loadPreviewUrls({
    fetchWithTimeout: async (url) => response({
      ok: false,
      status: 419,
      body: '<!doctype html><html><body><main id="vibyra-preview-http-error">Preview HTTP error HTTP 419 Page Expired</main></body></html>',
      url
    })
  });
  assert.equal(await resolveRunnableDesktopPreviewUrl(rootUrl), rootUrl);
});

test("preflight rejects non-diagnostic HTTP failures", async () => {
  const rootUrl = "http://192.168.1.109:4317/preview/server/project/token/";
  const { resolveRunnableDesktopPreviewUrl } = await loadPreviewUrls({
    fetchWithTimeout: async (url) => response({ ok: false, status: 500, body: "Server Error", url })
  });
  assert.equal(await resolveRunnableDesktopPreviewUrl(rootUrl), null);
});

test("preflight rejects ordinary failed bundled assets", async () => {
  const rootUrl = "http://192.168.1.109:4317/preview/server/project/token/";
  const scriptUrl = `${rootUrl}assets/app.js`;
  const { resolveRunnableDesktopPreviewUrl } = await loadPreviewUrls({
    fetchWithTimeout: async (url) => {
      if (url === rootUrl) return response({ body: `<script src="${scriptUrl}"></script>`, url });
      if (url === scriptUrl) return response({ ok: false, status: 500, body: "Broken bundle", url });
      throw new Error(`Unexpected fetch ${url}`);
    }
  });
  assert.equal(await resolveRunnableDesktopPreviewUrl(rootUrl), null);
});

test("preflight resolves assets against the document base href", async () => {
  const rootUrl = "http://192.168.1.109:4317/preview/project/project/token/";
  const scriptUrl = `${rootUrl}game/assets/main.js`;
  const calls = [];
  const { resolveRunnableDesktopPreviewUrl } = await loadPreviewUrls({
    fetchWithTimeout: async (url) => {
      calls.push(url);
      if (url === rootUrl) return response({ body: '<base href="./game/"><script src="assets/main.js"></script>', url });
      if (url === scriptUrl) return response({ body: "ready", contentType: "application/javascript", url });
      throw new Error(`Unexpected fetch ${url}`);
    }
  });
  assert.equal(await resolveRunnableDesktopPreviewUrl(rootUrl), rootUrl);
  assert.deepEqual(calls, [rootUrl, scriptUrl]);
});

test("preflight ignores malformed mixed-quote base href values", async () => {
  const rootUrl = "http://192.168.1.109:4317/preview/project/project/token/";
  const scriptUrl = `${rootUrl}assets/main.js`;
  const calls = [];
  const { resolveRunnableDesktopPreviewUrl } = await loadPreviewUrls({
    fetchWithTimeout: async (url) => {
      calls.push(url);
      if (url === rootUrl) return response({ body: '<base href="./game/\'>"><script src="assets/main.js"></script>', url });
      if (url === scriptUrl) return response({ body: "ready", contentType: "application/javascript", url });
      throw new Error(`Unexpected fetch ${url}`);
    }
  });
  assert.equal(await resolveRunnableDesktopPreviewUrl(rootUrl), rootUrl);
  assert.deepEqual(calls, [rootUrl, scriptUrl]);
});
