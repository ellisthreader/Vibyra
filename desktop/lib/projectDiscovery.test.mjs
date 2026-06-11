import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { discoverProjectsFromRoots } from "./projectDiscovery.mjs";

test("project discovery finds nested marked projects", async () => {
  const root = await mkdtemp(join(tmpdir(), "vibyra-discovery-"));
  try {
    const projectPath = join(root, "clients", "portal");
    await mkdir(projectPath, { recursive: true });
    await writeFile(join(projectPath, "package.json"), "{}");

    const projects = await discoverProjectsFromRoots([root]);

    assert.equal(projects.some((project) => project.path === projectPath), true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("explicitly selected plain folders remain discoverable without markers", async () => {
  const root = await mkdtemp(join(tmpdir(), "vibyra-selected-folder-"));
  try {
    await writeFile(join(root, "notes.txt"), "plain folder");

    const projects = await discoverProjectsFromRoots([root], [root]);

    assert.equal(projects[0]?.path, root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
