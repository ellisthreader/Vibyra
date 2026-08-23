import assert from "node:assert/strict";
import test from "node:test";
import { loadRelease } from "./projectPublishRelease.testSupport.mjs";

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
