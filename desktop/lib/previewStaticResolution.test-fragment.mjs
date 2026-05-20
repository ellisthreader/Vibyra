import test from "node:test";
import assert from "node:assert/strict";
import { chmod, mkdir, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { dirname, join } from "node:path";
import { appState, TOKEN } from "./state.mjs";
import { previewServerProxyUrl } from "./preview.mjs";
import { startProjectDevServer } from "./previewDevServer.mjs";
import { STATIC_PREVIEW_ENTRIES } from "./previewResolver.mjs";
import { escapeRegExp, findFreePort, killTrackedPreview, makeFakeNpm, makeFakePhp, makeProject, makeRouteServer, makeViteLikeServer, occupyPort, proxyPathFor, requestPreview, requestPreviewProxyPath, requestPreviewRefererAsset, requestPreviewServerProxy, requestPreviewUrlProxy, viteErrorHtml } from "./previewTestHelpers.mjs";

test("desktop preview skips source-only Vite root entries", async () => {
  const { project, cleanup } = await makeProject("vibyra-preview-source-");
  try {
    await mkdir(join(project.path, "src"), { recursive: true });
    await writeFile(join(project.path, "index.html"), '<!doctype html><html><body><script data-entry="app" type="module" src="/src/custom-entry.tsx"></script></body></html>');
    await writeFile(join(project.path, "src", "custom-entry.tsx"), "console.log('source only');");

    const response = await requestPreview(project);
    assert.equal(response.status, 404);
    assert.match(response.body, /No runnable preview found/);
    assert.doesNotMatch(response.body, /custom-entry/);
  } finally {
    await cleanup();
  }
});

test("desktop preview does not serve stray root index files for Laravel Vite projects", async () => {
  const { project, cleanup } = await makeProject("vibyra-preview-laravel-static-");
  try {
    await writeFile(join(project.path, "index.html"), "<!doctype html><html><body>Generated placeholder menu</body></html>");
    await writeFile(join(project.path, "composer.json"), JSON.stringify({ require: { "laravel/framework": "^13.0" } }));
    await writeFile(join(project.path, "package.json"), JSON.stringify({
      scripts: { dev: "vite" },
      devDependencies: { "laravel-vite-plugin": "latest", vite: "latest" }
    }));

    const response = await requestPreview(project);
    assert.equal(response.status, 404);
    assert.match(response.body, /No runnable preview found/);
    assert.doesNotMatch(response.body, /Generated placeholder menu/);
  } finally {
    await cleanup();
  }
});

test("desktop preview redirects source-only Vite projects to a verified running dev server", async () => {
  const { project, cleanup } = await makeProject("vibyra-preview-vite-dev-");
  const dev = await makeViteLikeServer('<!doctype html><html><body><script type="module" src="/src/main.tsx"></script></body></html>');
  try {
    await mkdir(join(project.path, "src"), { recursive: true });
    await writeFile(join(project.path, "index.html"), '<!doctype html><html><body><script type="module" src="/src/main.tsx"></script></body></html>');
    await writeFile(join(project.path, "src", "main.tsx"), "console.log('source only');");
    await writeFile(join(project.path, "package.json"), JSON.stringify({ scripts: { dev: `vite --host 0.0.0.0 --port ${dev.port}` }, devDependencies: { vite: "latest" } }));

    const response = await requestPreview(project, "", { host: "127.0.0.1:4317" });
    assert.equal(response.status, 302);
    assert.equal(response.headers.Location, `http://127.0.0.1:${dev.port}`);
  } finally {
    await dev.close();
    await cleanup();
  }
});

test("desktop preview ignores unrelated servers on a dev-server port", async () => {
  const { project, cleanup } = await makeProject("vibyra-preview-vite-unrelated-");
  const dev = await makeViteLikeServer('<!doctype html><html><body><script type="module" src="/src/other.tsx"></script></body></html>');
  try {
    await mkdir(join(project.path, "src"), { recursive: true });
    await writeFile(join(project.path, "index.html"), '<!doctype html><html><body><script type="module" src="/src/main.tsx"></script></body></html>');
    await writeFile(join(project.path, "src", "main.tsx"), "console.log('source only');");
    await writeFile(join(project.path, "package.json"), JSON.stringify({ scripts: { dev: `vite --host 0.0.0.0 --port ${dev.port}` }, devDependencies: { vite: "latest" } }));

    const response = await requestPreview(project, "", { host: "127.0.0.1:4317" });
    assert.equal(response.status, 404);
    assert.match(response.body, /No runnable preview found/);
  } finally {
    await dev.close();
    await cleanup();
  }
});
