import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

import {
  activateDesktopPreviewServer,
  desktopPreviewStartup,
  startDesktopPreviewServer,
  stopDesktopPreviewServer
} from "./desktopPreview.mjs";
import { detectPreviewTargets } from "./previewTargets.mjs";
import { previewServicesForProject } from "./previewServices.mjs";
import { stopTrackedPreviewServer } from "./previewServerProcesses.mjs";
import { makeFakeNpm, makeProject, requestPreviewServerProxy } from "./previewTestHelpers.mjs";
import { appState } from "./state.mjs";

test("desktop preview runs targets concurrently and keeps visual URLs target-pinned", async () => {
  const { project, cleanup } = await makeProject("desktop-preview-services-");
  const fakeNpm = await makeFakeNpm();
  const previousProjects = appState.cachedProjects;
  const previousPath = process.env.PATH;
  const previousHtml = process.env.VIBYRA_FAKE_VITE_HTML;
  try {
    await makeViteTarget(project.path, "apps/one", "one");
    await makeViteTarget(project.path, "apps/two", "two");
    appState.cachedProjects = [project];
    process.env.PATH = `${fakeNpm.bin}:${previousPath || ""}`;
    const targets = await detectPreviewTargets(project);
    const one = targets.find((target) => target.appDirectory === "apps/one");
    const two = targets.find((target) => target.appDirectory === "apps/two");
    assert.ok(one);
    assert.ok(two);

    process.env.VIBYRA_FAKE_VITE_HTML = viteHtml("one");
    const first = await startDesktopPreviewServer({ projectId: project.id, targetId: one.id }, "127.0.0.1:4317");
    const firstCredential = decodeURIComponent(first.preview.url.split("/")[4]);

    process.env.VIBYRA_FAKE_VITE_HTML = viteHtml("two");
    const second = await startDesktopPreviewServer({ projectId: project.id, targetId: two.id }, "127.0.0.1:4317");

    assert.equal(previewServicesForProject(project.id).length, 2);
    assert.equal(appState.previewServers[project.id].targetId, two.id);
    assert.equal(second.preview.targets.find((target) => target.id === one.id).runtime.state, "running");
    assert.equal(second.preview.targets.find((target) => target.id === two.id).runtime.state, "running");
    assert.equal(desktopPreviewStartup(project.id, one.id).startup.targetId, one.id);
    assert.equal(desktopPreviewStartup(project.id, two.id).startup.targetId, two.id);

    const pinned = await requestPreviewServerProxy(project, "", "vibyra.test", { token: firstCredential });
    assert.equal(pinned.status, 200);
    assert.match(pinned.body, />one</);

    const activated = await activateDesktopPreviewServer({ projectId: project.id, targetId: one.id });
    assert.equal(activated.preview.activeTargetId, one.id);
    assert.equal(appState.previewServers[project.id].targetId, one.id);

    const stopped = await stopDesktopPreviewServer({ projectId: project.id, targetId: one.id });
    assert.equal(stopped.preview.activeTargetId, two.id);
    assert.equal(previewServicesForProject(project.id).length, 1);
    assert.equal(previewServicesForProject(project.id)[0].targetId, two.id);
  } finally {
    for (const service of previewServicesForProject(project.id)) {
      stopTrackedPreviewServer(project.id, service.targetId);
    }
    appState.cachedProjects = previousProjects;
    restoreEnv("PATH", previousPath);
    restoreEnv("VIBYRA_FAKE_VITE_HTML", previousHtml);
    await fakeNpm.cleanup();
    await cleanup();
  }
});

async function makeViteTarget(projectPath, directory, label) {
  const root = join(projectPath, directory);
  await mkdir(join(root, "src"), { recursive: true });
  await writeFile(join(root, "index.html"), viteHtml(label));
  await writeFile(join(root, "src", "main.js"), `console.log(${JSON.stringify(label)});`);
  await writeFile(join(root, "package.json"), JSON.stringify({
    name: `preview-${label}`,
    scripts: { dev: "vite" },
    devDependencies: { vite: "latest" }
  }));
}

function viteHtml(label) {
  return `<!doctype html><html><body><main>${label}</main><script type="module" src="/src/main.js"></script></body></html>`;
}

function restoreEnv(name, value) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}
