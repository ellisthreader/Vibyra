import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

async function loadHostedDemo(mockNetwork = {}) {
  const source = await readFile(new URL("./hostedDemo.ts", import.meta.url), "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }
  }).outputText;
  const module = { exports: {} };
  const network = {
    fetchWithTimeout: async () => { throw new Error("unexpected fetch"); },
    normalizeAgentUrl: (value) => String(value ?? "").trim().replace(/\/+$/, ""),
    ...mockNetwork
  };
  const require = (specifier) => {
    if (specifier === "./network") return network;
    throw new Error(`Unexpected import ${specifier}`);
  };
  new Function("require", "exports", "module", output)(require, module.exports, module);
  return module.exports;
}

test("hosted demo request skips stale route and preserves a complete bundle from fallback URL", async () => {
  const calls = [];
  const { requestHostedDemoBundle } = await loadHostedDemo({
    fetchWithTimeout: async (url) => {
      calls.push(url);
      if (url.startsWith("http://stale")) return response(404, {});
      return response(200, {
        ok: true,
        entryPath: "dist/index.html",
        files: [{ body: "<!doctype html>", encoding: "utf8", path: "dist/index.html" }]
      });
    }
  });

  const result = await requestHostedDemoBundle({
    agentUrl: "http://current",
    connection: { url: "http://stale", token: "token", machineName: "PC", connectionUrls: [] },
    projectId: "project id"
  });

  assert.equal(result.ok, true);
  assert.equal(result.entryPath, "dist/index.html");
  assert.equal(result.files.length, 1);
  assert.deepEqual(calls, [
    "http://stale/files/publish-demo-bundle?projectId=project%20id",
    "http://current/files/publish-demo-bundle?projectId=project%20id"
  ]);
});

test("hosted demo request does not hide desktop failure reasons", async () => {
  const { requestHostedDemoBundle } = await loadHostedDemo({
    fetchWithTimeout: async () => response(500, { reason: "Static build failed before capture." })
  });
  const result = await requestHostedDemoBundle({
    agentUrl: "http://desktop",
    connection: { url: "http://desktop", token: "", machineName: "PC" },
    projectId: "project"
  });

  assert.equal(result.status, "failed");
  assert.equal(result.message, "Static build failed before capture.");
});

test("hosted demo request rejects an incomplete success payload before publish", async () => {
  const { requestHostedDemoBundle } = await loadHostedDemo({
    fetchWithTimeout: async () => response(200, { ok: true, entryPath: "dist/index.html", files: [] })
  });
  const result = await requestHostedDemoBundle({
    agentUrl: "http://desktop",
    connection: { url: "http://desktop", token: "", machineName: "PC" },
    projectId: "project"
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, "unavailable");
  assert.equal(result.message, "Desktop returned an incomplete hosted demo bundle.");
});

test("runtime request keeps a valid Laravel bundle and retries network route misses", async () => {
  let calls = 0;
  const { requestHostedRuntimeBundle } = await loadHostedDemo({
    fetchWithTimeout: async () => {
      calls += 1;
      if (calls === 1) throw new Error("Request timed out after 180s");
      return response(200, {
        ok: true,
        platform: "laravel",
        files: [{ body: '{"require":{"laravel/framework":"^12.0"}}', encoding: "utf8", path: "composer.json" }]
      });
    }
  });
  const result = await requestHostedRuntimeBundle({
    agentUrl: "http://current",
    connection: { url: "http://stale", token: "", machineName: "PC" },
    projectId: "project"
  });

  assert.equal(calls, 2);
  assert.equal(result.ok, true);
  assert.equal(result.platform, "laravel");
  assert.equal(result.status, "pending");
});

test("runtime request accepts a Python backend manifest", async () => {
  const { requestHostedRuntimeBundle } = await loadHostedDemo({
    fetchWithTimeout: async () => response(200, {
      ok: true,
      platform: "python",
      files: [{ body: "fastapi==0.115.0", encoding: "utf8", path: "requirements.txt" }]
    })
  });
  const result = await requestHostedRuntimeBundle({
    agentUrl: "http://desktop",
    connection: { url: "http://desktop", token: "", machineName: "PC" },
    projectId: "project"
  });

  assert.equal(result.ok, true);
  assert.equal(result.platform, "python");
  assert.equal(result.status, "pending");
});

function response(status, payload) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return payload;
    }
  };
}
