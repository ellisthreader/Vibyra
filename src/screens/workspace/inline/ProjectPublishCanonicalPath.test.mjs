import assert from "node:assert/strict";
import test from "node:test";
import {
  loadRelease,
  publishAppFixture,
  publishListingFixture,
  publishProjectFixture
} from "./projectPublishRelease.testSupport.mjs";

test("mobile bundle requests forward the canonical project path with project ID", async () => {
  const calls = [];
  const runtimeBundle = { files: [], ok: true, platform: "node", status: "pending" };
  const hostedDemo = { entryPath: "dist/index.html", files: [], ok: true, status: "ready" };
  const app = publishAppFixture();
  app.loadProjectReviewFiles = async (projectId, projectPath) => {
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

  await publishProjectRelease({
    app,
    onProgress: () => {},
    payload: publishListingFixture,
    project: publishProjectFixture()
  });

  for (const [, request] of calls) {
    assert.equal(request.projectId, "desktop-id");
    assert.equal(request.projectPath, "/actual/project/path");
  }
});
