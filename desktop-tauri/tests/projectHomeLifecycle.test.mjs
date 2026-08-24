import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  applyProjectVisibility,
  createProjectTransitionQueue,
  enterProjectHome,
  projectRuntimeTransitions,
  syncProjectVisibility,
} from "../src/lib/projectTransitions.ts";

function deferred() {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

test("overlapping project transitions finish and persist in request order", async () => {
  const queue = createProjectTransitionQueue();
  const gate = deferred();
  const events = [];
  const activate = queue.run(async () => {
    events.push("activate:start");
    await gate.promise;
    events.push("activate:persisted");
  });
  const home = queue.run(async () => events.push("home:finished"));

  await Promise.resolve();
  assert.deepEqual(events, ["activate:start"]);
  gate.resolve();
  await Promise.all([activate, home]);
  assert.deepEqual(events, ["activate:start", "activate:persisted", "home:finished"]);
});

test("a rejected transition does not strand later navigation", async () => {
  const queue = createProjectTransitionQueue();
  const failed = queue.run(async () => {
    throw new Error("save failed");
  });
  const home = queue.run(async () => "home");
  await assert.rejects(failed, /save failed/);
  assert.equal(await home, "home");
});

test("a failed native visibility update remains eligible for retry", async () => {
  let panes = [
    { id: 1, projectId: "a", status: "running", visibility: "visible" },
    { id: 2, projectId: "b", status: "running", visibility: "visible" },
    { id: 3, projectId: "a", status: "running", visibility: "hibernated" },
  ];
  let failFirst = true;
  const update = async (id) => {
    if (id === 1 && failFirst) throw new Error("IPC unavailable");
  };

  panes = applyProjectVisibility(panes, await syncProjectVisibility(panes, null, update));
  assert.equal(panes[0].visibility, "visible");
  assert.equal(panes[1].visibility, "hidden");
  assert.equal(panes[2].visibility, "hibernated");

  failFirst = false;
  panes = applyProjectVisibility(panes, await syncProjectVisibility(panes, null, update));
  assert.equal(panes[0].visibility, "hidden");
});

test("Home quiesces project work before clearing and unmounting it", async () => {
  const events = [];
  await enterProjectHome({
    activeRoot: "/project",
    hideTerminals: async () => events.push("terminals:hidden"),
    stopPreviews: async (root) => {
      events.push(`preview:stopped:${root}`);
      throw new Error("already stopped");
    },
    stopWatcher: async () => {
      events.push("watcher:stopped");
      throw new Error("already stopped");
    },
    clearWorkspace: () => events.push("workspace:cleared"),
    showHome: () => events.push("home:shown"),
  });
  assert.deepEqual(events, [
    "terminals:hidden",
    "preview:stopped:/project",
    "watcher:stopped",
    "workspace:cleared",
    "home:shown",
  ]);
});

test("project store routes startup and navigation through the ordered lifecycle", async () => {
  const sourcePath = fileURLToPath(new URL("../src/state/projectStore.ts", import.meta.url));
  const source = await readFile(sourcePath, "utf8");
  assert.match(source, /init: \(\) => projectRuntimeTransitions\.run/);
  assert.match(source, /activate: \(id\) => projectRuntimeTransitions\.run/);
  assert.match(source, /goHome: \(\) => projectRuntimeTransitions\.run\(goHomeNow\)/);
  assert.match(source, /clearWorkspace:[\s\S]*root: null/);
  assert.match(source, /await persist\(touched, id\)/);
  assert.doesNotMatch(source, /void persist\(touched, id\)/);
});

test("navigation and mode switches use one shared runtime queue", async () => {
  const workspacePath = fileURLToPath(
    new URL("../src/components/layout/ProjectWorkspace.tsx", import.meta.url),
  );
  const workspace = await readFile(workspacePath, "utf8");
  assert.match(workspace, /projectRuntimeTransitions\.run\(async \(\) =>/);
  assert.match(workspace, /if \([\s\S]*!current[\s\S]*return new Map\(\)/);
  assert.match(workspace, /syncProjectVisibility/);
  assert.doesNotMatch(workspace, /createProjectTransitionQueue/);
});

test("a queued mode IPC cannot overtake a later Home transition", async () => {
  const gate = deferred();
  const events = [];
  const mode = projectRuntimeTransitions.run(async () => {
    events.push("mode:start");
    await gate.promise;
    events.push("mode:native-finished");
  });
  const home = projectRuntimeTransitions.run(async () => events.push("home:hidden"));
  await Promise.resolve();
  assert.deepEqual(events, ["mode:start"]);
  gate.resolve();
  await Promise.all([mode, home]);
  assert.deepEqual(events, ["mode:start", "mode:native-finished", "home:hidden"]);
});
