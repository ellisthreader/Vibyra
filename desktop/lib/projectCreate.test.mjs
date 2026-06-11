import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import test from "node:test";
import { createDesktopProject } from "./projectCreate.mjs";

const execFileAsync = promisify(execFile);

test("managed project creation enforces the membership cap without touching existing projects", async () => {
  const root = await mkdtemp(join(tmpdir(), "vibyra-project-limit-"));
  try {
    const first = await createDesktopProject("First", {
      rootPath: root,
      maxActiveProjects: 1
    });
    assert.equal(first.name, "First");

    await assert.rejects(
      createDesktopProject("Second", {
        rootPath: root,
        maxActiveProjects: 1
      }),
      (error) => error?.status === 403
        && error?.code === "membership_project_limit"
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("parallel managed project creates cannot race past the cap", async () => {
  const root = await mkdtemp(join(tmpdir(), "vibyra-project-race-"));
  try {
    const results = await Promise.allSettled([
      createDesktopProject("One", { rootPath: root, maxActiveProjects: 1 }),
      createDesktopProject("Two", { rootPath: root, maxActiveProjects: 1 })
    ]);

    assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
    assert.equal(results.filter((result) => result.status === "rejected").length, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("separate desktop processes cannot race past the managed project cap", async () => {
  const root = await mkdtemp(join(tmpdir(), "vibyra-project-process-race-"));
  const moduleUrl = new URL("./projectCreate.mjs", import.meta.url).href;
  const script = `
    const { createDesktopProject } = await import(process.argv[1]);
    await createDesktopProject(process.argv[3], {
      rootPath: process.argv[2],
      maxActiveProjects: 1
    });
  `;
  try {
    const results = await Promise.allSettled([
      execFileAsync(process.execPath, ["--input-type=module", "-e", script, moduleUrl, root, "One"]),
      execFileAsync(process.execPath, ["--input-type=module", "-e", script, moduleUrl, root, "Two"])
    ]);

    assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
    assert.equal(results.filter((result) => result.status === "rejected").length, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
