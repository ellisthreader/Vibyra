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
          bundle.platform === "laravel" || Boolean(bundle.metadata?.frontendDistDirectory)
        )
      };
    }
    throw new Error(`Unexpected import ${specifier}`);
  };
  new Function("require", "exports", "module", output)(require, module.exports, module);
  return module.exports;
}

test("publish identity consistently prefers the canonical desktop project", async () => {
  const { publishProjectIdentity } = await loadRelease();
  assert.deepEqual(publishProjectIdentity({
    id: "stale-card-id",
    name: "App",
    path: "/stale/path",
    sourceProject: { id: "desktop-id", name: "App", path: "/actual/app", stack: "React", updated: "now" },
    stack: "React",
    status: "On PC",
    updated: "now"
  }), {
    projectId: "desktop-id",
    projectPath: "/actual/app"
  });
});

test("full-stack publish uses one canonical project ID for desktop and backend calls", async () => {
  const calls = [];
  const runtimeBundle = {
    files: [{ body: "{}", path: "composer.json" }, { body: "js", path: "public/build/assets/app.js" }],
    ok: true,
    platform: "laravel",
    status: "pending"
  };
  const { publishProjectRelease } = await loadRelease({
    publishProject: async (payload) => {
      calls.push(["publish", payload]);
      return { outcome: "published", publishStatus: { sourceProjectId: payload.projectId } };
    },
    requestHostedDemoBundle: async () => {
      calls.push(["demo"]);
      return null;
    },
    requestHostedRuntimeBundle: async ({ projectId }) => {
      calls.push(["runtime", projectId]);
      return runtimeBundle;
    }
  });
  const app = {
    adoptProject: async () => calls.push(["adopt"]),
    agentUrl: "http://desktop",
    authToken: "token",
    connection: { url: "http://desktop" },
    loadProjectReviewFiles: async (projectId) => {
      calls.push(["review", projectId]);
      return { files: [], totalFiles: 0, truncated: false };
    },
    projects: [],
    selectProject: async (projectId) => {
      calls.push(["select", projectId]);
      return [];
    }
  };
  const project = {
    id: "stale-card-id",
    name: "Shop",
    path: "/stale/path",
    sourceProject: { id: "desktop-id", name: "Shop", path: "/actual/shop", stack: "React + Laravel", updated: "now" },
    stack: "React + Laravel",
    status: "On PC",
    updated: "now"
  };

  await publishProjectRelease({
    app,
    onProgress: () => {},
    payload: {
      description: "A shop",
      logoImageUrl: "",
      screenshotUrls: [],
      tags: ["React", "Laravel"],
      title: "Shop",
      visibility: "public"
    },
    project
  });

  assert.deepEqual(calls.filter(([name]) => ["select", "review", "runtime"].includes(name)), [
    ["select", "desktop-id"],
    ["review", "desktop-id"],
    ["runtime", "desktop-id"]
  ]);
  assert.equal(calls.some(([name]) => name === "demo"), false);
  const publishPayload = calls.find(([name]) => name === "publish")[1];
  assert.equal(publishPayload.projectId, "desktop-id");
  assert.deepEqual(publishPayload.capabilities, { backend: true, frontend: true });
  assert.equal(publishPayload.runtimeBundle, runtimeBundle);
});

test("duplicate project-not-found failures become one actionable folder error", async () => {
  const { publicPreviewPublishError } = await loadRelease();
  const message = publicPreviewPublishError({
    hostedDemo: { message: "Project not found", status: "failed" },
    previewHtml: "",
    projectPath: "/home/user/apps/shop",
    runtimeBundle: { message: "Project not found", status: "failed" },
    visibility: "public"
  });

  assert.equal(message, "Vibyra Desktop could not find this project folder (/home/user/apps/shop). Reopen the actual app folder from Browse PC, then publish again.");
  assert.equal((message.match(/Project not found/gi) ?? []).length, 0);
});

test("specific build errors are preserved without a generic preview prefix", async () => {
  const { publicPreviewPublishError } = await loadRelease();
  const message = publicPreviewPublishError({
    hostedDemo: { message: "npm run build failed: Cannot resolve @vitejs/plugin-react.", status: "failed" },
    previewHtml: "",
    projectPath: "/app",
    runtimeBundle: null,
    visibility: "public"
  });

  assert.equal(message, "npm run build failed: Cannot resolve @vitejs/plugin-react.");
});

test("required backend failures keep the exact runtime error", async () => {
  const exactError = "composer install failed: ext-intl is required.";
  const { publishProjectRelease } = await loadRelease({
    requestHostedRuntimeBundle: async () => ({
      message: exactError,
      needsRuntime: true,
      platform: "laravel",
      status: "failed"
    })
  });
  const project = {
    id: "desktop-id",
    name: "App",
    path: "/actual/app",
    stack: "React + Laravel",
    status: "On PC",
    updated: "now"
  };

  await assert.rejects(() => publishProjectRelease({
    app: {
      agentUrl: "http://desktop",
      authToken: "token",
      connection: { url: "http://desktop" },
      loadProjectReviewFiles: async () => ({ files: [] }),
      projects: [],
      selectProject: async () => []
    },
    onProgress: () => {},
    payload: {
      description: "App",
      logoImageUrl: "",
      screenshotUrls: [],
      tags: [],
      title: "App",
      visibility: "public"
    },
    project
  }), new RegExp(exactError.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});

test("full-stack runtime capability includes both frontend and backend", async () => {
  const { publishCapabilities } = await loadRelease();
  assert.deepEqual(publishCapabilities({
    hostedDemo: null,
    previewHtml: "",
    runtimeBundle: { ok: true, platform: "laravel", status: "pending" }
  }), {
    backend: true,
    frontend: true
  });
});
