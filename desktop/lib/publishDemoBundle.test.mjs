import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { appState } from "./state.mjs";
import { buildProjectPublishDemoBundle } from "./publishDemoBundle.mjs";
import { makeProject } from "./previewTestHelpers.mjs";

test("publish demo bundle includes static entry dependencies and binary assets", async () => {
  const { project, cleanup } = await makeProject("vibyra-publish-demo-");
  const previousProjects = appState.cachedProjects;
  appState.cachedProjects = [project];
  try {
    await mkdir(join(project.path, "dist", "assets"), { recursive: true });
    await mkdir(join(project.path, "dist", "models"), { recursive: true });
    await writeFile(join(project.path, "dist", "index.html"), [
      "<!doctype html><html><head>",
      "<link rel=\"stylesheet\" href=\"/assets/app.css\">",
      "</head><body><img src=\"/assets/logo.png\"><script type=\"module\" src=\"./assets/app.js\"></script></body></html>"
    ].join(""));
    await writeFile(join(project.path, "dist", "assets", "app.css"), "body{background:url('/assets/bg.webp')}");
    await writeFile(join(project.path, "dist", "assets", "app.js"), "const model = '/models/level.glb'; import('./chunk.mjs');");
    await writeFile(join(project.path, "dist", "assets", "chunk.mjs"), "export const ready = true;");
    await writeFile(join(project.path, "dist", "assets", "logo.png"), Buffer.from([1, 2, 3]));
    await writeFile(join(project.path, "dist", "assets", "bg.webp"), Buffer.from([4, 5, 6]));
    await writeFile(join(project.path, "dist", "models", "level.glb"), Buffer.from([7, 8, 9]));

    const result = await buildProjectPublishDemoBundle(project.id);
    assert.equal(result.ok, true);
    assert.equal(result.entryPath, "dist/index.html");
    assert.equal(result.mountDirectory, "dist");
    assert.deepEqual(result.files.map((file) => file.path).sort(), [
      "dist/assets/app.css",
      "dist/assets/app.js",
      "dist/assets/bg.webp",
      "dist/assets/chunk.mjs",
      "dist/assets/logo.png",
      "dist/index.html",
      "dist/models/level.glb"
    ]);
    assert.equal(result.files.find((file) => file.path.endsWith("logo.png"))?.encoding, "base64");
    assert.equal(result.metadata.totalFiles, 7);
    assert.equal(result.metadata.truncated, false);
  } finally {
    appState.cachedProjects = previousProjects;
    await cleanup();
  }
});

test("publish demo bundle skips env, credential, and unsafe directory references", async () => {
  const { project, cleanup } = await makeProject("vibyra-publish-safe-");
  const previousProjects = appState.cachedProjects;
  appState.cachedProjects = [project];
  try {
    await mkdir(join(project.path, "node_modules", "bad"), { recursive: true });
    await writeFile(join(project.path, "index.html"), "<script src=\"app.js\"></script><script src=\"/.env\"></script><script src=\"/node_modules/bad/secret.js\"></script>");
    await writeFile(join(project.path, "app.js"), "console.log('ok')");
    await writeFile(join(project.path, ".env"), "SECRET=yes");
    await writeFile(join(project.path, "node_modules", "bad", "secret.js"), "console.log('secret')");

    const result = await buildProjectPublishDemoBundle(project.id);
    assert.equal(result.ok, true);
    assert.deepEqual(result.files.map((file) => file.path).sort(), ["app.js", "index.html"]);
    assert.equal(result.metadata.skipped.some((item) => item.path === ".env" && item.reason === "env_or_credential_file"), true);
    assert.equal(result.metadata.skipped.some((item) => item.path === "node_modules/bad/secret.js"), true);
  } finally {
    appState.cachedProjects = previousProjects;
    await cleanup();
  }
});

test("publish demo bundle rejects source-only Vite entries", async () => {
  const { project, cleanup } = await makeProject("vibyra-publish-source-");
  const previousProjects = appState.cachedProjects;
  appState.cachedProjects = [project];
  try {
    await writeFile(join(project.path, "index.html"), "<div id=\"root\"></div><script type=\"module\" src=\"/src/main.jsx\"></script>");
    const result = await buildProjectPublishDemoBundle(project.id);
    assert.equal(result.ok, false);
    assert.equal(result.code, "no_static_preview_entry");
    assert.deepEqual(result.files, []);
  } finally {
    appState.cachedProjects = previousProjects;
    await cleanup();
  }
});

test("publish demo bundle fails clearly when required dependencies exceed caps", async () => {
  const { project, cleanup } = await makeProject("vibyra-publish-cap-");
  const previousProjects = appState.cachedProjects;
  appState.cachedProjects = [project];
  try {
    await writeFile(join(project.path, "index.html"), "<script src=\"app.js\"></script>");
    await writeFile(join(project.path, "app.js"), "x".repeat(200));
    const result = await buildProjectPublishDemoBundle(project.id, { limits: { maxTotalBytes: 120 } });
    assert.equal(result.ok, false);
    assert.equal(result.code, "bundle_limit_exceeded");
    assert.match(result.reason, /bundle limit reached/i);
    assert.deepEqual(result.files, []);
  } finally {
    appState.cachedProjects = previousProjects;
    await cleanup();
  }
});
