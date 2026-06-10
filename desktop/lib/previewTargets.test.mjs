import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { detectPreviewTargets, resolvePreviewTarget } from "./previewTargets.mjs";

test("preview target detection finds nested web, mobile, and desktop apps", async () => {
  const root = await mkdtemp(join(tmpdir(), "vibyra-preview-targets-"));
  try {
    await writePackage(root, "apps/marketing", {
      name: "marketing",
      scripts: { dev: "vite" },
      devDependencies: { vite: "latest" }
    });
    await writePackage(root, "apps/mobile", {
      name: "mobile",
      scripts: { web: "expo start --web" },
      dependencies: { expo: "latest", "react-native": "latest" }
    });
    await writePackage(root, "apps/desktop", {
      name: "desktop",
      scripts: { start: "electron ." },
      devDependencies: { electron: "latest" }
    });
    await writePackage(root, "node_modules/ignored", {
      name: "ignored",
      scripts: { dev: "vite" },
      devDependencies: { vite: "latest" }
    });

    const project = { id: "project", path: root };
    const targets = await detectPreviewTargets(project);

    assert.deepEqual(targets.map((target) => target.name).sort(), ["desktop", "marketing", "mobile"]);
    assert.equal(targets.find((target) => target.name === "marketing")?.framework, "Vite");
    assert.equal(targets.find((target) => target.name === "mobile")?.framework, "Expo web");
    assert.equal(targets.find((target) => target.name === "desktop")?.available, false);
    assert.match(targets.find((target) => target.name === "desktop")?.reason || "", /desktop app/i);
    assert.equal(await resolvePreviewTarget(project, "fabricated"), null);
    assert.equal((await resolvePreviewTarget(project, targets[0].id))?.appDirectory, targets[0].appDirectory);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

async function writePackage(root, directory, value) {
  const path = join(root, directory);
  await mkdir(path, { recursive: true });
  await writeFile(join(path, "package.json"), JSON.stringify(value));
}
