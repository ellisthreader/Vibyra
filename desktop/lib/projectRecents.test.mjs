import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { recentProjectPaths, rememberRecentProject } from "./projectRecents.mjs";

test("recent projects persist newest-first without duplicates", async () => {
  const root = await mkdtemp(join(tmpdir(), "vibyra-project-recents-"));
  const recentsPath = join(root, "recent-projects.json");
  try {
    await rememberRecentProject(join(root, "one"), recentsPath);
    await rememberRecentProject(join(root, "two"), recentsPath);
    await rememberRecentProject(join(root, "one"), recentsPath);

    assert.deepEqual(await recentProjectPaths(recentsPath), [
      resolve(root, "one"),
      resolve(root, "two")
    ]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
