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

test("approved preview server start runs the fixed dev command and verifies the URL", async () => {
  const { project, cleanup } = await makeProject("vibyra-preview-start-server-");
  const fakeNpm = await makeFakeNpm();
  const port = await findFreePort();
  const html = '<!doctype html><html><body><script type="module" src="/src/main.tsx"></script></body></html>';
  try {
    await mkdir(join(project.path, "src"), { recursive: true });
    await writeFile(join(project.path, "index.html"), html);
    await writeFile(join(project.path, "src", "main.tsx"), "console.log('started');");
    await writeFile(join(project.path, "package.json"), JSON.stringify({ scripts: { dev: `vite --host 0.0.0.0 --port ${port}` }, devDependencies: { vite: "latest" } }));

    const result = await startProjectDevServer(project, "127.0.0.1:4317", {
      env: {
        PATH: `${fakeNpm.bin}:${process.env.PATH ?? ""}`,
        VIBYRA_FAKE_VITE_HTML: html,
        VIBYRA_FAKE_VITE_PORT: String(port)
      },
      timeoutMs: 6000
    });
    assert.equal(result.command, `npm run dev -- --host 0.0.0.0 --port ${port}`);
    assert.equal(result.started, true);
    assert.equal(result.url, `http://127.0.0.1:${port}`);
  } finally {
    appState.previewServers[project.id]?.process?.kill();
    delete appState.previewServers[project.id];
    await fakeNpm.cleanup();
    await cleanup();
  }
});

test("approved preview server start follows the fallback port Vite prints", async () => {
  const { project, cleanup } = await makeProject("vibyra-preview-start-fallback-port-");
  const fakeNpm = await makeFakeNpm();
  const port = await findFreePort();
  const html = '<!doctype html><html><body><script type="module" src="/src/main.tsx"></script></body></html>';
  try {
    await mkdir(join(project.path, "src"), { recursive: true });
    await writeFile(join(project.path, "index.html"), html);
    await writeFile(join(project.path, "src", "main.tsx"), "console.log('fallback port');");
    await writeFile(join(project.path, "package.json"), JSON.stringify({ scripts: { dev: "vite" }, devDependencies: { vite: "latest" } }));

    const result = await startProjectDevServer(project, "127.0.0.1:4317", {
      env: {
        PATH: `${fakeNpm.bin}:${process.env.PATH ?? ""}`,
        VIBYRA_FAKE_VITE_HTML: html,
        VIBYRA_FAKE_VITE_PORT: String(port)
      },
      timeoutMs: 6000
    });
    assert.equal(result.url, `http://127.0.0.1:${port}`);
  } finally {
    appState.previewServers[project.id]?.process?.kill();
    delete appState.previewServers[project.id];
    await fakeNpm.cleanup();
    await cleanup();
  }
});

test("approved preview server start parses decorated Vite fallback output", async () => {
  const { project, cleanup } = await makeProject("vibyra-preview-start-decorated-output-");
  const fakeNpm = await makeFakeNpm();
  const port = await findFreePort();
  const html = '<!doctype html><html><body><script type="module" src="/src/main.tsx"></script></body></html>';
  try {
    await mkdir(join(project.path, "src"), { recursive: true });
    await writeFile(join(project.path, "index.html"), html);
    await writeFile(join(project.path, "src", "main.tsx"), "console.log('decorated port');");
    await writeFile(join(project.path, "package.json"), JSON.stringify({ scripts: { dev: "vite" }, devDependencies: { vite: "latest" } }));

    const result = await startProjectDevServer(project, "127.0.0.1:4317", {
      env: {
        PATH: `${fakeNpm.bin}:${process.env.PATH ?? ""}`,
        VIBYRA_FAKE_VITE_DECORATED_OUTPUT: "1",
        VIBYRA_FAKE_VITE_HTML: html,
        VIBYRA_FAKE_VITE_PORT: String(port)
      },
      timeoutMs: 6000
    });
    assert.equal(result.url, `http://127.0.0.1:${port}`);
  } finally {
    appState.previewServers[project.id]?.process?.kill();
    delete appState.previewServers[project.id];
    await fakeNpm.cleanup();
    await cleanup();
  }
});

test("approved preview server start does not require a root source-only index before launch", async () => {
  const { project, cleanup } = await makeProject("vibyra-preview-start-no-index-");
  const fakeNpm = await makeFakeNpm();
  const port = await findFreePort();
  const html = '<!doctype html><html><body><main>Vite app</main><script type="module" src="/src/main.tsx"></script></body></html>';
  try {
    await writeFile(join(project.path, "package.json"), JSON.stringify({ scripts: { dev: `vite --host 0.0.0.0 --port ${port}` }, devDependencies: { vite: "latest" } }));

    const result = await startProjectDevServer(project, "127.0.0.1:4317", {
      env: {
        PATH: `${fakeNpm.bin}:${process.env.PATH ?? ""}`,
        VIBYRA_FAKE_VITE_HTML: html,
        VIBYRA_FAKE_VITE_PORT: String(port)
      },
      timeoutMs: 6000
    });
    assert.equal(result.command, `npm run dev -- --host 0.0.0.0 --port ${port}`);
    assert.equal(result.started, true);
    assert.equal(result.url, `http://127.0.0.1:${port}`);
  } finally {
    appState.previewServers[project.id]?.process?.kill();
    delete appState.previewServers[project.id];
    await fakeNpm.cleanup();
    await cleanup();
  }
});
