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

test("desktop preview URL candidates probe absolute URLs without the control bearer", async () => {
  const { desktopPreviewUrlCandidates } = await loadPreviewUrls();
  const target = "http://127.0.0.1:8000/";
  const candidates = desktopPreviewUrlCandidates({
    url: "http://192.168.1.20:4317",
    connectionUrls: ["http://10.0.0.9:4317"],
    token: "control-bearer-must-not-leak"
  }, target);
  assert.deepEqual(candidates, [
    target,
    "http://192.168.1.20:8000/",
    "http://10.0.0.9:8000/"
  ]);
  assert.equal(candidates.some((candidate) => candidate.includes("control-bearer-must-not-leak")), false);
  assert.equal(candidates.some((candidate) => candidate.includes("/preview/proxy-url/")), false);
});

test("reachable desktop preview resolution probes an absolute URL directly", async () => {
  const target = "http://127.0.0.1:8000/";
  const calls = [];
  const { resolveReachableDesktopPreviewUrl } = await loadPreviewUrls({
    fetchWithTimeout: async (url) => {
      calls.push(url);
      assert.equal(url, target);
      return response({
        body: "<!doctype html><html><body>ready</body></html>",
        url
      });
    }
  });

  const resolved = await resolveReachableDesktopPreviewUrl({
    url: "http://192.168.1.20:4317",
    token: "control-bearer-must-not-leak"
  }, target);

  assert.equal(resolved, target);
  assert.deepEqual(calls, [target]);
});

test("desktop preview URL candidates keep relative scoped paths on remembered LAN bridge hosts", async () => {
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

test("reachable desktop preview resolution skips unreachable returned host and uses LAN fallback", async () => {
  const calls = [];
  const okUrl = "http://192.168.1.20:5174/";
  const { resolveReachableDesktopPreviewUrl } = await loadPreviewUrls({
    fetchWithTimeout: async (url) => {
      calls.push(url);
      if (url !== okUrl) throw new Error("not reachable from phone");
      return response({
        body: "<!doctype html><html><body>ready</body></html>",
        url
      });
    }
  });
  const resolved = await resolveReachableDesktopPreviewUrl({
    url: "http://192.168.1.20:4317",
    connectionUrls: ["http://10.0.0.9:4317"]
  }, "http://127.0.0.1:5174/");
  assert.equal(resolved, okUrl);
  assert.deepEqual(calls, ["http://127.0.0.1:5174/", okUrl]);
});

test("desktop preview preflight allows Vite source module 500s so the preview can show app diagnostics", async () => {
  const rootUrl = "http://192.168.1.109:4317/preview/server/project/token/";
  const scriptUrl = `http://192.168.1.109:4317/preview/proxy-url/token/?url=${encodeURIComponent("http://127.0.0.1:5175/resources/js/app.tsx")}`;
  const { resolveRunnableDesktopPreviewUrl } = await loadPreviewUrls({
    fetchWithTimeout: async (url) => {
      if (url === rootUrl) {
        return response({
          body: `<!doctype html><html><body><script type="module" src="${scriptUrl}"></script></body></html>`,
          url
        });
      }
      if (url === scriptUrl) return response({ ok: false, status: 500, body: "Vite transform failed", url });
      throw new Error(`Unexpected fetch ${url}`);
    }
  });

  assert.equal(await resolveRunnableDesktopPreviewUrl(rootUrl), rootUrl);
});

test("desktop preview preflight allows HTTP diagnostic pages so the modal can show framework errors", async () => {
  const rootUrl = "http://192.168.1.109:4317/preview/server/project/token/login";
  const { resolveRunnableDesktopPreviewUrl } = await loadPreviewUrls({
    fetchWithTimeout: async (url) => {
      assert.equal(url, rootUrl);
      return response({
        ok: false,
        status: 419,
        body: '<!doctype html><html><body><main id="vibyra-preview-http-error">Preview HTTP error HTTP 419 Page Expired</main></body></html>',
        url
      });
    }
  });

  assert.equal(await resolveRunnableDesktopPreviewUrl(rootUrl), rootUrl);
});

test("desktop preview preflight rejects non-diagnostic HTTP failures", async () => {
  const rootUrl = "http://192.168.1.109:4317/preview/server/project/token/";
  const { resolveRunnableDesktopPreviewUrl } = await loadPreviewUrls({
    fetchWithTimeout: async (url) => {
      assert.equal(url, rootUrl);
      return response({ ok: false, status: 500, body: "<!doctype html><html><body>Server Error</body></html>", url });
    }
  });

  assert.equal(await resolveRunnableDesktopPreviewUrl(rootUrl), null);
});

test("desktop preview preflight still rejects ordinary failed bundled assets", async () => {
  const rootUrl = "http://192.168.1.109:4317/preview/server/project/token/";
  const scriptUrl = `${rootUrl}assets/app.js`;
  const { resolveRunnableDesktopPreviewUrl } = await loadPreviewUrls({
    fetchWithTimeout: async (url) => {
      if (url === rootUrl) {
        return response({
          body: `<!doctype html><html><body><script type="module" src="${scriptUrl}"></script></body></html>`,
          url
        });
      }
      if (url === scriptUrl) return response({ ok: false, status: 500, body: "Broken bundle", url });
      throw new Error(`Unexpected fetch ${url}`);
    }
  });

  assert.equal(await resolveRunnableDesktopPreviewUrl(rootUrl), null);
});

test("desktop preview preflight resolves relative assets against the document base href", async () => {
  const rootUrl = "http://192.168.1.109:4317/preview/project/project/token/";
  const scriptUrl = `${rootUrl}game/assets/main.js`;
  const calls = [];
  const { resolveRunnableDesktopPreviewUrl } = await loadPreviewUrls({
    fetchWithTimeout: async (url) => {
      calls.push(url);
      if (url === rootUrl) {
        return response({
          body: '<!doctype html><html><head><base href="./game/"></head><body><script src="assets/main.js"></script></body></html>',
          url
        });
      }
      if (url === scriptUrl) return response({ body: "console.log('ready')", contentType: "application/javascript", url });
      throw new Error(`Unexpected fetch ${url}`);
    }
  });

  assert.equal(await resolveRunnableDesktopPreviewUrl(rootUrl), rootUrl);
  assert.deepEqual(calls, [rootUrl, scriptUrl]);
});

test("desktop preview preflight ignores malformed mixed-quote base href values", async () => {
  const rootUrl = "http://192.168.1.109:4317/preview/project/project/token/";
  const scriptUrl = `${rootUrl}assets/main.js`;
  const calls = [];
  const { resolveRunnableDesktopPreviewUrl } = await loadPreviewUrls({
    fetchWithTimeout: async (url) => {
      calls.push(url);
      if (url === rootUrl) {
        return response({
          body: '<!doctype html><html><head><base href="./game/\'>"></head><body><script src="assets/main.js"></script></body></html>',
          url
        });
      }
      if (url === scriptUrl) return response({ body: "console.log('ready')", contentType: "application/javascript", url });
      throw new Error(`Unexpected fetch ${url}`);
    }
  });

  assert.equal(await resolveRunnableDesktopPreviewUrl(rootUrl), rootUrl);
  assert.deepEqual(calls, [rootUrl, scriptUrl]);
});

function response({ ok = true, status = 200, body = "", contentType = "text/html; charset=utf-8", url }) {
  return {
    ok,
    status,
    url,
    headers: {
      get(name) {
        return String(name).toLowerCase() === "content-type" ? contentType : "";
      }
    },
    async text() {
      return body;
    }
  };
}
