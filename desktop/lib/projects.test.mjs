import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { appState } from "./state.mjs";
import { browseDesktopPath } from "./projectBrowse.mjs";
import { projectIdFromPath } from "./projectInfo.mjs";
import { FULL_PC_PROJECT_ID, projectById, terminalProjectById } from "./projects.mjs";

test("Full PC project scope resolves only for terminals", () => {
  const project = terminalProjectById(FULL_PC_PROJECT_ID);

  assert.equal(projectById(FULL_PC_PROJECT_ID), null);
  assert.equal(project.id, "full-pc");
  assert.equal(project.name, "Full PC");
  assert.equal(project.path, homedir());
  assert.equal(project.briefRequired, false);
});

test("manufactured encoded project IDs are not trusted", () => {
  const encoded = Buffer.from("/home/ellis/.ssh").toString("base64url");

  assert.equal(projectById(encoded), null);
  assert.equal(terminalProjectById(encoded), null);
});

test("project IDs recover real apps after the in-memory cache is lost", async () => {
  const path = await mkdtemp(join(tmpdir(), "vibyra-project-id-"));
  const previousProjects = appState.cachedProjects;
  try {
    await writeFile(join(path, "package.json"), JSON.stringify({ scripts: { build: "vite build" } }));
    const id = projectIdFromPath(path);
    appState.cachedProjects = [];

    const project = projectById(id);

    assert.equal(project?.id, id);
    assert.equal(project?.path, path);
  } finally {
    appState.cachedProjects = previousProjects;
    await rm(path, { recursive: true, force: true });
  }
});

test("legacy padded base64 project IDs resolve to their canonical project", async () => {
  const path = await mkdtemp(join(tmpdir(), "vibyra-legacy-project-id-"));
  const previousProjects = appState.cachedProjects;
  try {
    await writeFile(join(path, "composer.json"), "{}");
    const legacyId = Buffer.from(path).toString("base64");
    appState.cachedProjects = [];

    const project = projectById(legacyId);

    assert.equal(project?.id, projectIdFromPath(path));
    assert.equal(project?.path, path);
  } finally {
    appState.cachedProjects = previousProjects;
    await rm(path, { recursive: true, force: true });
  }
});

test("explicit project paths recover a real folder from a stale opaque ID", async () => {
  const path = await mkdtemp(join(tmpdir(), "vibyra-project-path-"));
  const previousProjects = appState.cachedProjects;
  try {
    await writeFile(join(path, "index.html"), "<!doctype html><title>App</title>");
    appState.cachedProjects = [];

    const project = projectById("stale-project-id", path);

    assert.equal(project?.id, projectIdFromPath(path));
    assert.equal(project?.path, path);
  } finally {
    appState.cachedProjects = previousProjects;
    await rm(path, { recursive: true, force: true });
  }
});

test("cached projects with missing folders are not trusted", async () => {
  const path = await mkdtemp(join(tmpdir(), "vibyra-missing-project-"));
  const previousProjects = appState.cachedProjects;
  try {
    await writeFile(join(path, "package.json"), "{}");
    const id = projectIdFromPath(path);
    appState.cachedProjects = [{ id, name: "Missing", path }];
    await rm(path, { recursive: true, force: true });

    assert.equal(projectById(id), null);
    assert.equal(terminalProjectById(id), null);
  } finally {
    appState.cachedProjects = previousProjects;
    await rm(path, { recursive: true, force: true });
  }
});

test("folders selected through Browse PC remain trusted after cache replacement", async () => {
  const path = await mkdtemp(join(tmpdir(), "vibyra-browsed-folder-"));
  const previousProjects = appState.cachedProjects;
  try {
    await mkdir(join(path, "assets"));
    const result = await browseDesktopPath(path);
    appState.cachedProjects = [];

    const project = projectById(result.current.id);

    assert.equal(project?.path, path);
  } finally {
    appState.cachedProjects = previousProjects;
    await rm(path, { recursive: true, force: true });
  }
});
