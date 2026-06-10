import assert from "node:assert/strict";
import test from "node:test";
import { appState } from "./state.mjs";
import { buildProjectPublishDemoBundle } from "./publishDemoBundle.mjs";
import { buildProjectPublishRuntimeBundle } from "./publishRuntimeBundle.mjs";
import { resolveDesktopProject } from "./projects.mjs";
import {
  makePublishContractFixture,
  publishContractFixtures
} from "./publishContractFixtures.test-helper.mjs";

async function withFixture(name, files, run) {
  const fixture = await makePublishContractFixture(name, files);
  const previousProjects = appState.cachedProjects;
  appState.cachedProjects = [fixture.project];
  try {
    await run(fixture.project);
  } finally {
    appState.cachedProjects = previousProjects;
    await fixture.cleanup();
  }
}

test("nested React/Vite and Laravel publishes frontend and backend from their actual roots", async () => {
  await withFixture("react-laravel", publishContractFixtures.nestedReactLaravel, async (project) => {
    const demo = await buildProjectPublishDemoBundle(project.id, { autoBuild: false });
    const runtime = await buildProjectPublishRuntimeBundle(project.id);
    assert.equal(demo.ok, true);
    assert.equal(demo.entryPath, "frontend/dist/index.html");
    assert.equal(runtime.ok, true);
    assert.equal(runtime.platform, "laravel");
    assert.equal(runtime.metadata.runtimeDirectory, "backend");
    assert.equal(runtime.files.some((file) => file.path.startsWith("backend/")), false);
    assert.equal(runtime.files.some((file) => file.path === ".env"), false);
  });
});

test("frontend-only React publishes static output and is not misclassified as a server", async () => {
  await withFixture("react-only", publishContractFixtures.frontendReact, async (project) => {
    const demo = await buildProjectPublishDemoBundle(project.id, { autoBuild: false });
    const runtime = await buildProjectPublishRuntimeBundle(project.id);
    assert.equal(demo.ok, true);
    assert.equal(demo.entryPath, "dist/index.html");
    assert.equal(runtime.ok, false);
    assert.equal(runtime.code, "unsupported_runtime");
  });
});

test("Laravel Inertia provides both a static shell and a live Laravel runtime", async () => {
  await withFixture("laravel-inertia", publishContractFixtures.laravelInertia, async (project) => {
    const demo = await buildProjectPublishDemoBundle(project.id, { autoBuild: false });
    const runtime = await buildProjectPublishRuntimeBundle(project.id);
    assert.equal(demo.ok, true);
    assert.equal(demo.metadata.kind, "laravel-vite-static-shell");
    assert.equal(runtime.ok, true);
    assert.equal(runtime.platform, "laravel");
    assert.equal(runtime.files.some((file) => file.path === "public/build/assets/app.js"), true);
    assert.equal(runtime.files.some((file) => file.path.startsWith("resources/js/")), false);
  });
});

test("Node full-stack publishes a static frontend and a server runtime", async () => {
  await withFixture("node-full-stack", publishContractFixtures.nodeFullStack, async (project) => {
    const demo = await buildProjectPublishDemoBundle(project.id, { autoBuild: false });
    const runtime = await buildProjectPublishRuntimeBundle(project.id);
    assert.equal(demo.ok, true);
    assert.equal(runtime.ok, true);
    assert.equal(runtime.platform, "node");
    assert.equal(runtime.startCommand, "npm run start");
    assert.equal(runtime.files.some((file) => file.path === ".env"), false);
  });
});

test("Python full-stack produces one runtime containing its built frontend", async () => {
  await withFixture("python-full-stack", publishContractFixtures.pythonFullStack, async (project) => {
    const runtime = await buildProjectPublishRuntimeBundle(project.id);
    assert.equal(runtime.ok, true);
    assert.equal(runtime.platform, "python");
    assert.equal(runtime.metadata.frontendDistDirectory, "frontend/dist");
    assert.equal(runtime.files.some((file) => file.path === "_vibyra_runtime.py"), true);
    assert.equal(runtime.files.some((file) => file.path === "frontend/dist/index.html"), true);
    assert.equal(runtime.files.some((file) => file.path.startsWith("frontend/src/")), false);
  });
});

test("path-derived project IDs recover after the desktop cache is stale", async () => {
  await withFixture("stale-cache", publishContractFixtures.frontendReact, async (project) => {
    appState.cachedProjects = [];
    const recovered = await buildProjectPublishDemoBundle(project.id, { autoBuild: false });
    assert.equal(recovered.ok, true);
    assert.equal(recovered.metadata.projectPath, project.path);

    appState.cachedProjects = [];
    const fallback = await resolveDesktopProject("stale-non-path-id", project.path);
    assert.equal(fallback?.path, project.path);
  });
});

test("oversized runtime payloads preserve the user-facing hosting refusal", async () => {
  await withFixture("oversized", publishContractFixtures.nodeFullStack, async (project) => {
    const runtime = await buildProjectPublishRuntimeBundle(project.id, { limits: { maxFiles: 1 } });
    assert.equal(runtime.ok, false);
    assert.equal(runtime.code, "runtime_bundle_limit_exceeded");
    assert.equal(runtime.reason, "This project is too large for Vibyra hosting, so we can’t host it. Open a smaller app folder or remove unnecessary files, then try again.");
  });
});

test("failed frontend builds preserve the actionable command output", async () => {
  await withFixture("failed-build", publishContractFixtures.failedBuild, async (project) => {
    const demo = await buildProjectPublishDemoBundle(project.id, { buildTimeoutMs: 15000 });
    assert.equal(demo.ok, false);
    assert.equal(demo.code, "frontend_build_failed");
    assert.match(demo.reason, /Contract build failed: missing browser dependency/);
  });
});

test("environment and credential files never enter a runtime payload", async () => {
  await withFixture("unsafe-node", publishContractFixtures.unsafeNode, async (project) => {
    const runtime = await buildProjectPublishRuntimeBundle(project.id);
    assert.equal(runtime.ok, true);
    const paths = runtime.files.map((file) => file.path);
    assert.equal(paths.includes(".env"), false);
    assert.equal(paths.includes("credentials/private-key.pem"), false);
    assert.equal(runtime.metadata.skipped.some((item) => item.path === ".env"), true);
    assert.equal(runtime.metadata.skipped.some((item) => item.path === "credentials" || item.path.startsWith("credentials/")), true);
  });
});

test("desktop rejects secret directories before backend acceptance", async () => {
  await withFixture("secret-directories", publishContractFixtures.unsafeNode, async (project) => {
    const runtime = await buildProjectPublishRuntimeBundle(project.id);
    assert.equal(runtime.ok, true);
    assert.equal(runtime.files.some((file) => file.path.startsWith("secrets/")), false);
    assert.equal(runtime.files.some((file) => file.path.startsWith("credentials/")), false);
    assert.equal(runtime.metadata.skipped.some((item) => item.path === "secrets" || item.path.startsWith("secrets/")), true);
  });
});

test("publish bundle builders use projectPath for stale opaque IDs", async () => {
  await withFixture("stale-transport", publishContractFixtures.nodeFullStack, async (project) => {
    appState.cachedProjects = [];
    const demo = await buildProjectPublishDemoBundle("stale-opaque-id", {
      autoBuild: false,
      projectPath: project.path
    });
    appState.cachedProjects = [];
    const runtime = await buildProjectPublishRuntimeBundle("stale-opaque-id", {
      projectPath: project.path
    });
    assert.equal(demo.ok, true);
    assert.equal(runtime.ok, true);
    assert.equal(demo.metadata.projectPath, project.path);
    assert.equal(runtime.metadata.projectPath, project.path);
  });
});
