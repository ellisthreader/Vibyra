import assert from "node:assert/strict";
import test from "node:test";
import {
  loadRelease,
  publishAppFixture as app,
  publishListingFixture as listing,
  publishProjectFixture as project
} from "./projectPublishRelease.testSupport.mjs";

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
