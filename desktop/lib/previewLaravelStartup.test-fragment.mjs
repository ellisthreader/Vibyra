import test from "node:test";
import assert from "node:assert/strict";
import { access, chmod, mkdir, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { dirname, join } from "node:path";
import { appState, TOKEN } from "./state.mjs";
import { previewServerProxyUrl } from "./preview.mjs";
import { startProjectDevServer } from "./previewDevServer.mjs";
import { STATIC_PREVIEW_ENTRIES } from "./previewResolver.mjs";
import { escapeRegExp, findFreePort, killTrackedPreview, makeFakeNpm, makeFakePhp, makeProject, makeRouteServer, makeViteLikeServer, occupyPort, proxyPathFor, requestPreview, requestPreviewProxyPath, requestPreviewRefererAsset, requestPreviewServerProxy, requestPreviewUrlProxy, viteErrorHtml } from "./previewTestHelpers.mjs";

test("approved Laravel preview startup tolerates delayed PHP and Vite readiness", async () => {
  const { project, cleanup } = await makeProject("vibyra-preview-start-laravel-delay-");
  const fakeNpm = await makeFakeNpm();
  const fakePhp = await makeFakePhp();
  const vitePort = await findFreePort();
  const laravelPort = await findFreePort();
  try {
    await writeFile(join(project.path, "artisan"), "");
    await writeFile(join(project.path, "composer.json"), JSON.stringify({ require: { "laravel/framework": "^13.0" } }));
    await writeFile(join(project.path, "package.json"), JSON.stringify({
      scripts: { dev: "vite" },
      devDependencies: { vite: "latest", "laravel-vite-plugin": "latest" }
    }));

    const startedAt = Date.now();
    const result = await startProjectDevServer(project, "127.0.0.1:4317", {
      env: {
        PATH: `${fakePhp.bin}:${fakeNpm.bin}:${process.env.PATH ?? ""}`,
        VIBYRA_FAKE_LARAVEL_DELAY_MS: "1200",
        VIBYRA_FAKE_VITE_DELAY_MS: "1200",
        VIBYRA_FAKE_LARAVEL_HTML: "<!doctype html><html><body>Delayed Laravel</body></html>",
        VIBYRA_FAKE_VITE_HTML: "<!doctype html><html><body>Delayed Vite</body></html>"
      },
      laravelPort,
      port: vitePort,
      timeoutMs: 5000
    });
    assert.equal(result.started, true);
    assert.equal(result.url, `http://127.0.0.1:${laravelPort}`);
    assert.ok(Date.now() - startedAt >= 1000);
  } finally {
    killTrackedPreview(project.id);
    await fakePhp.cleanup();
    await fakeNpm.cleanup();
    await cleanup();
  }
});

test("approved Laravel preview startup rejects application error pages", async () => {
  const { project, cleanup } = await makeProject("vibyra-preview-start-laravel-500-");
  const fakeNpm = await makeFakeNpm();
  const fakePhp = await makeFakePhp();
  const vitePort = await findFreePort();
  const laravelPort = await findFreePort();
  try {
    await writeFile(join(project.path, "artisan"), "");
    await writeFile(join(project.path, "composer.json"), JSON.stringify({ require: { "laravel/framework": "^13.0" } }));
    await mkdir(join(project.path, "storage", "logs"), { recursive: true });
    await writeFile(join(project.path, "storage", "logs", "laravel.log"), "local.ERROR: SQLSTATE[HY000] [2002] php_network_getaddresses: getaddrinfo for mysql failed: Name or service not known\n");
    await writeFile(join(project.path, "package.json"), JSON.stringify({
      scripts: { dev: "vite" },
      devDependencies: { vite: "latest", "laravel-vite-plugin": "latest" }
    }));

    await assert.rejects(
      () => startProjectDevServer(project, "127.0.0.1:4317", {
        env: {
          PATH: `${fakePhp.bin}:${fakeNpm.bin}:${process.env.PATH ?? ""}`,
          VIBYRA_FAKE_LARAVEL_STATUS: "500",
          VIBYRA_FAKE_LARAVEL_HTML: "<!doctype html><html><body>Laravel exploded</body></html>",
          VIBYRA_FAKE_VITE_HTML: "<!doctype html><html><body>Vite assets only</body></html>"
        },
        laravelPort,
        port: vitePort,
        timeoutMs: 6000
      }),
      /DB_HOST=mysql/
    );
  } finally {
    killTrackedPreview(project.id);
    await fakePhp.cleanup();
    await fakeNpm.cleanup();
    await cleanup();
  }
});

test("approved Laravel preview startup removes a stale generated hot file", async () => {
  const { project, cleanup } = await makeProject("vibyra-preview-start-laravel-hot-");
  const fakeNpm = await makeFakeNpm();
  const fakePhp = await makeFakePhp();
  const vitePort = await findFreePort();
  const laravelPort = await findFreePort();
  try {
    await mkdir(join(project.path, "public"), { recursive: true });
    await writeFile(join(project.path, "public", "hot"), "http://localhost:5173");
    await chmod(join(project.path, "public", "hot"), 0o444);
    await writeFile(join(project.path, "artisan"), "");
    await writeFile(join(project.path, "composer.json"), JSON.stringify({ require: { "laravel/framework": "^13.0" } }));
    await writeFile(join(project.path, "package.json"), JSON.stringify({
      scripts: { dev: "vite" },
      devDependencies: { vite: "latest", "laravel-vite-plugin": "latest" }
    }));

    const result = await startProjectDevServer(project, "127.0.0.1:4317", {
      env: {
        PATH: `${fakePhp.bin}:${fakeNpm.bin}:${process.env.PATH ?? ""}`,
        VIBYRA_FAKE_LARAVEL_HTML: "<!doctype html><html><body>Laravel</body></html>",
        VIBYRA_FAKE_VITE_HTML: "<!doctype html><html><body>Vite</body></html>"
      },
      laravelPort,
      port: vitePort,
      timeoutMs: 5000
    });
    assert.equal(result.started, true);
    await assert.rejects(() => access(join(project.path, "public", "hot")));
  } finally {
    killTrackedPreview(project.id);
    await fakePhp.cleanup();
    await fakeNpm.cleanup();
    await cleanup();
  }
});

test("approved Laravel preview startup reports public hot ownership failures immediately", async () => {
  const { project, cleanup } = await makeProject("vibyra-preview-start-laravel-hot-error-");
  const fakeNpm = await makeFakeNpm();
  const fakePhp = await makeFakePhp();
  const vitePort = await findFreePort();
  const laravelPort = await findFreePort();
  try {
    await mkdir(join(project.path, "public"), { recursive: true });
    await writeFile(join(project.path, "artisan"), "");
    await writeFile(join(project.path, "composer.json"), JSON.stringify({ require: { "laravel/framework": "^13.0" } }));
    await writeFile(join(project.path, "package.json"), JSON.stringify({
      scripts: { dev: "vite" },
      devDependencies: { vite: "latest", "laravel-vite-plugin": "latest" }
    }));

    const startedAt = Date.now();
    await assert.rejects(
      () => startProjectDevServer(project, "127.0.0.1:4317", {
        env: {
          PATH: `${fakePhp.bin}:${fakeNpm.bin}:${process.env.PATH ?? ""}`,
          VIBYRA_FAKE_VITE_FAILURE: "WebSocket server error: Port 5173 is already in use\nError: EACCES: permission denied, open 'public/hot'"
        },
        laravelPort,
        port: vitePort,
        timeoutMs: 10000
      }),
      /generated hot-file.*not writable.*Do not run Vite with sudo/i
    );
    assert.ok(Date.now() - startedAt < 4000);
  } finally {
    killTrackedPreview(project.id);
    await fakePhp.cleanup();
    await fakeNpm.cleanup();
    await cleanup();
  }
});

test("approved Laravel preview tracks the actual Vite fallback port", async () => {
  const { project, cleanup } = await makeProject("vibyra-preview-start-laravel-vite-fallback-");
  const fakeNpm = await makeFakeNpm();
  const fakePhp = await makeFakePhp();
  const requestedVitePort = await findFreePort();
  const actualVitePort = await findFreePort();
  const laravelPort = await findFreePort();
  try {
    await mkdir(join(project.path, "public"), { recursive: true });
    await writeFile(join(project.path, "artisan"), "");
    await writeFile(join(project.path, "composer.json"), JSON.stringify({ require: { "laravel/framework": "^13.0" } }));
    await writeFile(join(project.path, "package.json"), JSON.stringify({
      scripts: { dev: "vite" },
      devDependencies: { vite: "latest", "laravel-vite-plugin": "latest" }
    }));

    const result = await startProjectDevServer(project, "127.0.0.1:4317", {
      env: {
        PATH: `${fakePhp.bin}:${fakeNpm.bin}:${process.env.PATH ?? ""}`,
        VIBYRA_FAKE_LARAVEL_HTML: "<!doctype html><html><body>Laravel</body></html>",
        VIBYRA_FAKE_VITE_HTML: "<!doctype html><html><body>Vite</body></html>",
        VIBYRA_FAKE_VITE_PORT: String(actualVitePort)
      },
      laravelPort,
      port: requestedVitePort,
      timeoutMs: 5000
    });
    assert.equal(result.started, true);
    assert.equal(appState.previewServers[project.id]?.viteProxyTargetUrl, `http://127.0.0.1:${actualVitePort}`);
  } finally {
    killTrackedPreview(project.id);
    await fakePhp.cleanup();
    await fakeNpm.cleanup();
    await cleanup();
  }
});
