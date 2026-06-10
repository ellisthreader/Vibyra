import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import test from "node:test";

import { openDesktopPreview, startDesktopPreviewServer } from "./desktopPreview.mjs";
import { previewCredentialAllowsProject } from "./previewCapabilities.mjs";
import { makeProject } from "./previewTestHelpers.mjs";
import { appState, TOKEN } from "./state.mjs";

const desktopPreviewSource = await readFile(new URL("./desktopPreview.mjs", import.meta.url), "utf8");

test("desktop preview uses a project-scoped capability instead of the phone bearer", async () => {
  const { project, cleanup } = await makeProject("desktop-preview-capability-");
  const previousProjects = appState.cachedProjects;
  const previousSelected = appState.selectedProjectId;
  const previousPreview = appState.latestPreview;
  const previousCredential = appState.latestPreviewCredential;
  try {
    await writeFile(`${project.path}/index.html`, "<!doctype html><title>Preview</title>");
    appState.cachedProjects = [project];
    appState.selectedProjectId = "stale-project";

    const result = await openDesktopPreview({ projectId: project.id }, "127.0.0.1:4317");
    const match = result.preview.url.match(/^\/preview\/project\/[^/]+\/([^/]+)\//);

    assert.equal(result.preview.state, "live");
    assert.ok(match);
    const credential = decodeURIComponent(match[1]);
    assert.notEqual(credential, TOKEN);
    assert.equal(previewCredentialAllowsProject(credential, project.id), true);
    assert.equal(previewCredentialAllowsProject(credential, "another-project"), false);
    assert.equal(appState.latestPreviewCredential, credential);
    assert.equal(result.preview.recommendation.preset, "laptop");
    assert.equal(result.preview.recommendation.orientation, "landscape");
  } finally {
    appState.cachedProjects = previousProjects;
    appState.selectedProjectId = previousSelected;
    appState.latestPreview = previousPreview;
    appState.latestPreviewCredential = previousCredential;
    await cleanup();
  }
});

test("desktop preview requires an explicit or selected project", async () => {
  const previousSelected = appState.selectedProjectId;
  appState.selectedProjectId = "";
  try {
    await assert.rejects(
      () => openDesktopPreview({}, "127.0.0.1:4317"),
      (error) => error.status === 422 && /Choose a desktop project/.test(error.message)
    );
  } finally {
    appState.selectedProjectId = previousSelected;
  }
});

test("desktop preview only proxies an already tracked server during inspection", () => {
  const proxyHelper = desktopPreviewSource.match(/function proxiedDesktopPreviewUrl[\s\S]*?\n}\n/)?.[0] || "";
  assert.match(desktopPreviewSource, /proxiedDesktopPreviewUrl/);
  assert.match(desktopPreviewSource, /appState\.previewServers\[project\.id\]\?\.url/);
  assert.match(desktopPreviewSource, /return previewServerProxyUrl\(project\.id, credential\)/);
  assert.doesNotMatch(proxyHelper, /startProjectDevServer/);
});

test("desktop preview returns the verified Expo run plan when Metro is not running", async () => {
  const { project, cleanup } = await makeProject("desktop-preview-expo-plan-");
  const previousProjects = appState.cachedProjects;
  try {
    await writeFile(`${project.path}/package.json`, JSON.stringify({
      scripts: { web: "expo start --web" },
      dependencies: { expo: "latest" }
    }));
    await writeFile(`${project.path}/app.json`, JSON.stringify({ expo: { name: "Unique Preview Plan" } }));
    await writeFile(`${project.path}/index.html`, "<!doctype html><title>Stale placeholder</title>");
    appState.cachedProjects = [{ ...project, detectedBrief: { kindId: "mobile-app", frameworkLabel: "Expo React Native" } }];
    const result = await openDesktopPreview({ projectId: project.id }, "127.0.0.1:4317");
    assert.equal(result.preview.url, null);
    assert.equal(result.preview.launch.available, true);
    assert.equal(result.preview.launch.framework, "Expo web");
    assert.equal(result.preview.launch.command, "npm run web -- --host lan");
  } finally {
    appState.cachedProjects = previousProjects;
    await cleanup();
  }
});

test("desktop preview refuses startup without a freshly detected target", async () => {
  const { project, cleanup } = await makeProject("desktop-preview-target-approval-");
  const previousProjects = appState.cachedProjects;
  try {
    await writeFile(`${project.path}/package.json`, JSON.stringify({
      scripts: { dev: "vite" },
      devDependencies: { vite: "latest" }
    }));
    appState.cachedProjects = [project];
    await assert.rejects(
      () => startDesktopPreviewServer({ projectId: project.id, targetId: "fabricated" }, "127.0.0.1:4317"),
      (error) => error.status === 422 && /Choose an available detected app/.test(error.message)
    );
  } finally {
    appState.cachedProjects = previousProjects;
    await cleanup();
  }
});
