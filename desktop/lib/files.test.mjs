import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { listProjectFiles, listProjectReviewFiles } from "./files.mjs";
import { projectIdFromPath } from "./projectInfo.mjs";
import { appState } from "./state.mjs";

test("file routes resolve an uncached project from its stable path ID", async () => {
  const path = await mkdtemp(join(tmpdir(), "vibyra-files-project-"));
  const previousProjects = appState.cachedProjects;
  try {
    await writeFile(join(path, "package.json"), "{}");
    await writeFile(join(path, "index.html"), "<!doctype html>");
    appState.cachedProjects = [];

    const files = await listProjectFiles(projectIdFromPath(path));

    assert.deepEqual(files.map((file) => file.path).sort(), ["index.html", "package.json"]);
  } finally {
    appState.cachedProjects = previousProjects;
    await rm(path, { recursive: true, force: true });
  }
});

test("publish review excludes environment and credential files", async () => {
  const path = await mkdtemp(join(tmpdir(), "vibyra-review-project-"));
  const previousProjects = appState.cachedProjects;
  try {
    await writeFile(join(path, "package.json"), "{}");
    await writeFile(join(path, "server.js"), "console.log('safe');");
    await writeFile(join(path, ".env"), "API_TOKEN=secret");
    await writeFile(join(path, "private-key.pem"), "secret");
    appState.cachedProjects = [];

    const review = await listProjectReviewFiles(projectIdFromPath(path));

    assert.deepEqual(review.files.map((file) => file.path).sort(), ["package.json", "server.js"]);
    assert.equal(review.totalFiles, 2);
    assert.equal(review.truncated, false);
  } finally {
    appState.cachedProjects = previousProjects;
    await rm(path, { recursive: true, force: true });
  }
});
