import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

async function loadRelease(overrides = {}) {
  const source = await readFile(new URL("./ProjectPublishRelease.ts", import.meta.url), "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }
  }).outputText;
  const module = { exports: {} };
  const require = (specifier) => {
    if (specifier === "../../../utils/communityApi") {
      return { publishProject: overrides.publishProject ?? (async (payload) => payload) };
    }
    if (specifier === "../../../utils/files") {
      return { pickPreviewHtml: overrides.pickPreviewHtml ?? (() => "") };
    }
    if (specifier === "../../../utils/hostedDemo") {
      return {
        requestHostedDemoBundle: overrides.requestHostedDemoBundle ?? (async () => null),
        requestHostedRuntimeBundle: overrides.requestHostedRuntimeBundle ?? (async () => null),
        runtimeBundleHostingError: overrides.runtimeBundleHostingError ?? (() => ""),
        runtimeBundleIncludesFrontend: (bundle) => bundle?.ok === true && (
          bundle.platform === "laravel"
          || ["frontend/dist", "client/dist", "web/dist", "dist"].includes(bundle.metadata?.frontendDistDirectory)
        )
      };
    }
    throw new Error(`Unexpected import ${specifier}`);
  };
  new Function("require", "exports", "module", output)(require, module.exports, module);
  return module.exports;
}

function project() {
  return {
    id: "card-id",
    name: "Contract App",
    path: "/stale/card/path",
    sourceProject: {
      id: "desktop-id",
      name: "Contract App",
      path: "/actual/project/path",
      stack: "Full stack",
      updated: "now"
    },
    stack: "Full stack",
    status: "On PC",
    updated: "now"
  };
}

function app() {
  return {
    adoptProject: async () => {},
    agentUrl: "http://desktop",
    authToken: "token",
    connection: { url: "http://desktop", token: "desktop-token" },
    loadProjectReviewFiles: async () => ({ files: [], totalFiles: 0, truncated: false }),
    projects: [{ id: "desktop-id" }],
    selectProject: async () => []
  };
}

const listing = {
  description: "Contract app",
  logoImageUrl: "",
  screenshotUrls: [],
  tags: ["contract"],
  title: "Contract App",
  visibility: "public"
};

test("frontend-only React falls back from runtime detection to a static hosted bundle", async () => {
  const calls = [];
  const hostedDemo = {
    entryPath: "dist/index.html",
    files: [{ body: "<main>React</main>", path: "dist/index.html" }],
    ok: true,
    status: "ready"
  };
  const { publishProjectRelease } = await loadRelease({
    requestHostedRuntimeBundle: async () => ({
      code: "unsupported_runtime",
      message: "This folder contains a frontend-only Node package.",
      ok: false,
      status: "unavailable"
    }),
    requestHostedDemoBundle: async () => hostedDemo,
    publishProject: async (payload) => {
      calls.push(payload);
      return { outcome: "published", project: {}, publishStatus: { sourceProjectId: payload.projectId } };
    }
  });

  await publishProjectRelease({ app: app(), onProgress: () => {}, payload: listing, project: project() });
  assert.equal(calls[0].hostedDemo, hostedDemo);
  assert.equal(calls[0].runtimeBundle.ok, false);
  assert.deepEqual(calls[0].capabilities, { backend: false, frontend: true });
});

test("Node full-stack submits both server runtime and static frontend payloads", async () => {
  let demoRequests = 0;
  let published;
  const runtimeBundle = {
    files: [{ body: "{}", path: "package.json" }],
    ok: true,
    platform: "node",
    startCommand: "npm run start",
    status: "pending"
  };
  const hostedDemo = {
    entryPath: "dist/index.html",
    files: [{ body: "<main>Node</main>", path: "dist/index.html" }],
    ok: true,
    status: "ready"
  };
  const { publishProjectRelease } = await loadRelease({
    requestHostedRuntimeBundle: async () => runtimeBundle,
    requestHostedDemoBundle: async () => {
      demoRequests += 1;
      return hostedDemo;
    },
    publishProject: async (payload) => {
      published = payload;
      return { outcome: "published", project: {}, publishStatus: { sourceProjectId: payload.projectId } };
    }
  });

  await publishProjectRelease({ app: app(), onProgress: () => {}, payload: listing, project: project() });
  assert.equal(demoRequests, 1);
  assert.equal(published.runtimeBundle, runtimeBundle);
  assert.equal(published.hostedDemo, hostedDemo);
  assert.deepEqual(published.capabilities, { backend: true, frontend: true });
});

test("Python full-stack runtime containing frontend skips duplicate static capture", async () => {
  let demoRequests = 0;
  let published;
  const runtimeBundle = {
    files: [
      { body: "fastapi", path: "requirements.txt" },
      { body: "<main>Python</main>", path: "frontend/dist/index.html" }
    ],
    metadata: { frontendDistDirectory: "frontend/dist" },
    ok: true,
    platform: "python",
    startCommand: "python -m uvicorn _vibyra_runtime:app",
    status: "pending"
  };
  const { publishProjectRelease } = await loadRelease({
    requestHostedRuntimeBundle: async () => runtimeBundle,
    requestHostedDemoBundle: async () => {
      demoRequests += 1;
      return null;
    },
    publishProject: async (payload) => {
      published = payload;
      return { outcome: "published", project: {}, publishStatus: { sourceProjectId: payload.projectId } };
    }
  });

  await publishProjectRelease({ app: app(), onProgress: () => {}, payload: listing, project: project() });
  assert.equal(demoRequests, 0);
  assert.equal(published.hostedDemo, null);
  assert.deepEqual(published.capabilities, { backend: true, frontend: true });
});

test("mobile bundle requests forward the canonical projectPath with projectId", async () => {
  const calls = [];
  const runtimeBundle = {
    files: [{ body: "{}", path: "package.json" }],
    ok: true,
    platform: "node",
    startCommand: "npm run start",
    status: "pending"
  };
  const hostedDemo = {
    entryPath: "dist/index.html",
    files: [{ body: "<main>Node</main>", path: "dist/index.html" }],
    ok: true,
    status: "ready"
  };
  const currentApp = app();
  currentApp.loadProjectReviewFiles = async (projectId, projectPath) => {
    calls.push(["review", { projectId, projectPath }]);
    return { files: [], totalFiles: 0, truncated: false };
  };
  const { publishProjectRelease } = await loadRelease({
    requestHostedRuntimeBundle: async (request) => {
      calls.push(["runtime", request]);
      return runtimeBundle;
    },
    requestHostedDemoBundle: async (request) => {
      calls.push(["demo", request]);
      return hostedDemo;
    },
    publishProject: async (payload) => ({
      outcome: "published",
      project: {},
      publishStatus: { sourceProjectId: payload.projectId }
    })
  });

  await publishProjectRelease({ app: currentApp, onProgress: () => {}, payload: listing, project: project() });

  for (const [, request] of calls) {
    assert.equal(request.projectId, "desktop-id");
    assert.equal(request.projectPath, "/actual/project/path");
  }
});
