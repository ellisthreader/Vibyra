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

test("top-level folders in project container roots are discoverable without markers", async () => {
  const root = await mkdtemp(join(tmpdir(), "vibyra-desktop-root-"));
  try {
    const plainProject = join(root, "clear dbs");
    await mkdir(plainProject, { recursive: true });
    await writeFile(join(plainProject, "README.txt"), "plain desktop project");

    const projects = await discoverProjectsFromRoots([root], [], {
      plainProjectContainerRoots: [root]
    });

    assert.equal(projects.some((project) => project.path === plainProject), true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("nested plain folders still need project markers", async () => {
  const root = await mkdtemp(join(tmpdir(), "vibyra-nested-plain-root-"));
  try {
    const nestedPlain = join(root, "client", "notes");
    await mkdir(nestedPlain, { recursive: true });
    await writeFile(join(nestedPlain, "README.txt"), "nested plain folder");

    const projects = await discoverProjectsFromRoots([root], [], {
      plainProjectContainerRoots: [root]
    });

    assert.equal(projects.some((project) => project.path === nestedPlain), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
