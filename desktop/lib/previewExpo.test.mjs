import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

import { runningProjectDevServerUrl } from "./previewDevServer.mjs";
import { makeProject, makeRouteServer } from "./previewTestHelpers.mjs";

test("Expo preview reuse requires the selected project title and a JavaScript bundle", async () => {
  const server = await makeRouteServer({
    "/": {
      contentType: "text/html; charset=utf-8",
      body: '<!doctype html><title>Selected Expo</title><style id="expo-reset"></style><script src="/node_modules/expo/AppEntry.bundle?platform=web"></script>'
    },
    "/node_modules/expo/AppEntry.bundle": {
      contentType: "application/javascript; charset=utf-8",
      body: "globalThis.__selected_expo__ = true;"
    }
  });
  const { project, cleanup } = await makeProject("vibyra-preview-expo-reuse-");
  try {
    await writeFile(join(project.path, "package.json"), JSON.stringify({
      scripts: { web: `expo start --web --port ${server.port}` },
      dependencies: { expo: "latest" }
    }));
    await writeFile(join(project.path, "app.json"), JSON.stringify({ expo: { name: "Selected Expo" } }));
    assert.equal(await runningProjectDevServerUrl(project, "127.0.0.1:4317"), `http://127.0.0.1:${server.port}`);

    await writeFile(join(project.path, "app.json"), JSON.stringify({ expo: { name: "Another Expo" } }));
    assert.equal(await runningProjectDevServerUrl(project, "127.0.0.1:4317"), null);
  } finally {
    await server.close();
    await cleanup();
  }
});
