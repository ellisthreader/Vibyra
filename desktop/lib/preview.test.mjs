import test from "node:test";
import assert from "node:assert/strict";
import { chmod, mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { appState, TOKEN } from "./state.mjs";
import { previewServerProxyUrl, servePreviewRefererAsset, servePreviewServerProxy, servePreviewUrlProxy, serveProjectPreview } from "./preview.mjs";
import { startProjectDevServer } from "./previewDevServer.mjs";
import { STATIC_PREVIEW_ENTRIES } from "./previewResolver.mjs";

test("desktop preview serves nested build assets from the entry root", async () => {
  const { project, cleanup } = await makeProject("vibyra-preview-nested-");
  try {
    await mkdir(join(project.path, "dist", "assets"), { recursive: true });
    await writeFile(join(project.path, "dist", "index.html"), [
      "<!doctype html><html><head>",
      '<link href="./style.css?v=1#sheet" rel="stylesheet">',
      "</head><body>",
      '<script src="/assets/app.js?v=2"></script>',
      "</body></html>"
    ].join(""));
    await writeFile(join(project.path, "dist", "style.css"), [
      '@import "/reset.css";',
      'body { background-image: url("/assets/bg.png?v=3#hero"); color: red; }',
      ".icon { background: url('./assets/icon.svg'); }",
      ".external { background: url('//cdn.example.com/image.png'); }"
    ].join("\n"));
    await writeFile(join(project.path, "dist", "reset.css"), "html { min-height: 100%; }");
    await writeFile(join(project.path, "dist", "assets", "bg.png"), "png");
    await writeFile(join(project.path, "dist", "assets", "icon.svg"), "<svg></svg>");
    await writeFile(join(project.path, "dist", "assets", "app.js"), 'console.log("nested asset");');

    const response = await requestPreview(project);
    const base = `/preview/project/${encodeURIComponent(project.id)}/${encodeURIComponent(TOKEN)}/`;
    assert.equal(response.status, 200);
    assert.match(response.body, new RegExp(`${escapeRegExp(base)}dist/assets/app\\.js\\?v=2`));
    assert.match(response.body, new RegExp(`${escapeRegExp(base)}dist/style\\.css\\?v=1#sheet`));

    const asset = await requestPreview(project, "dist/assets/app.js?v=2");
    assert.equal(asset.status, 200);
    assert.equal(asset.body, 'console.log("nested asset");');

    const css = await requestPreview(project, "dist/style.css?v=1");
    assert.equal(css.status, 200);
    assert.match(css.body, new RegExp(`@import "${escapeRegExp(base)}dist/reset\\.css"`));
    assert.match(css.body, new RegExp(`url\\("${escapeRegExp(base)}dist/assets/bg\\.png\\?v=3#hero"\\)`));
    assert.match(css.body, /url\('\.\/assets\/icon\.svg'\)/);
    assert.match(css.body, /url\('\/\/cdn\.example\.com\/image\.png'\)/);
  } finally {
    await cleanup();
  }
});

for (const entry of STATIC_PREVIEW_ENTRIES.filter((item) => item !== "index.html")) {
  test(`desktop preview mounts ${entry} as its static root`, async () => {
    const { project, cleanup } = await makeProject(`vibyra-preview-${entry.replace(/[^a-z0-9]+/gi, "-")}`);
    try {
      const entryDir = dirname(entry);
      await mkdir(join(project.path, entryDir, "assets"), { recursive: true });
      await writeFile(join(project.path, entry), '<!doctype html><html><body><script src="/assets/app.js"></script></body></html>');
      await writeFile(join(project.path, entryDir, "assets", "app.js"), `console.log(${JSON.stringify(entry)});`);

      const response = await requestPreview(project);
      const base = `/preview/project/${encodeURIComponent(project.id)}/${encodeURIComponent(TOKEN)}/`;
      assert.equal(response.status, 200);
      assert.match(response.body, new RegExp(`${escapeRegExp(base)}${escapeRegExp(entryDir)}/assets/app\\.js`));

      const asset = await requestPreview(project, `${entryDir}/assets/app.js`);
      assert.equal(asset.status, 200);
      assert.equal(asset.body, `console.log(${JSON.stringify(entry)});`);
    } finally {
      await cleanup();
    }
  });
}

test("desktop preview keeps root entry absolute assets at the project root", async () => {
  const { project, cleanup } = await makeProject("vibyra-preview-root-");
  try {
    await mkdir(join(project.path, "assets"), { recursive: true });
    await writeFile(join(project.path, "index.html"), '<!doctype html><html><body><script src="/assets/app.js"></script></body></html>');
    await writeFile(join(project.path, "assets", "app.js"), 'console.log("root asset");');

    const response = await requestPreview(project);
    const base = `/preview/project/${encodeURIComponent(project.id)}/${encodeURIComponent(TOKEN)}/`;
    assert.equal(response.status, 200);
    assert.match(response.body, new RegExp(`${escapeRegExp(base)}assets/app\\.js`));

    const asset = await requestPreview(project, "assets/app.js");
    assert.equal(asset.status, 200);
    assert.equal(asset.body, 'console.log("root asset");');
  } finally {
    await cleanup();
  }
});

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

test("approved preview server start supports Next dev scripts", async () => {
  const { project, cleanup } = await makeProject("vibyra-preview-start-next-");
  const fakeNpm = await makeFakeNpm();
  const port = await findFreePort();
  const html = '<!doctype html><html><body><div id="__next"></div><script id="__NEXT_DATA__" type="application/json">{}</script></body></html>';
  try {
    await writeFile(join(project.path, "package.json"), JSON.stringify({
      scripts: { dev: `next dev --port ${port}` },
      dependencies: { next: "latest", react: "latest", "react-dom": "latest" }
    }));

    const result = await startProjectDevServer(project, "127.0.0.1:4317", {
      env: {
        PATH: `${fakeNpm.bin}:${process.env.PATH ?? ""}`,
        VIBYRA_FAKE_OUTPUT_MODE: "next",
        VIBYRA_FAKE_PREVIEW_HTML: html,
        VIBYRA_FAKE_PREVIEW_PORT: String(port)
      },
      timeoutMs: 6000
    });
    assert.equal(result.command, `npm run dev -- --hostname 0.0.0.0 --port ${port}`);
    assert.equal(result.started, true);
    assert.equal(result.url, `http://127.0.0.1:${port}`);
  } finally {
    appState.previewServers[project.id]?.process?.kill();
    delete appState.previewServers[project.id];
    await fakeNpm.cleanup();
    await cleanup();
  }
});

test("approved preview server start runs Laravel PHP and Vite asset servers", async () => {
  const { project, cleanup } = await makeProject("vibyra-preview-start-laravel-");
  const fakeNpm = await makeFakeNpm();
  const fakePhp = await makeFakePhp();
  const vitePort = await findFreePort();
  const laravelPort = await findFreePort();
  const laravelHtml = "<!doctype html><html><body><div id=\"app\">Laravel app</div></body></html>";
  try {
    await writeFile(join(project.path, "artisan"), "");
    await writeFile(join(project.path, "composer.json"), JSON.stringify({ require: { "laravel/framework": "^13.0" } }));
    await writeFile(join(project.path, "package.json"), JSON.stringify({
      scripts: { dev: "vite" },
      devDependencies: { vite: "latest", "laravel-vite-plugin": "latest" }
    }));

    const result = await startProjectDevServer(project, "127.0.0.1:4317", {
      env: {
        PATH: `${fakePhp.bin}:${fakeNpm.bin}:${process.env.PATH ?? ""}`,
        VIBYRA_FAKE_LARAVEL_HTML: laravelHtml,
        VIBYRA_FAKE_VITE_HTML: "<!doctype html><html><body>Vite assets only</body></html>"
      },
      laravelPort,
      port: vitePort,
      timeoutMs: 6000
    });
    assert.equal(result.command, `php artisan serve --host 0.0.0.0 --port ${laravelPort} + npm run dev -- --host 0.0.0.0 --port ${vitePort}`);
    assert.equal(result.started, true);
    assert.equal(result.url, `http://127.0.0.1:${laravelPort}`);
  } finally {
    killTrackedPreview(project.id);
    await fakePhp.cleanup();
    await fakeNpm.cleanup();
    await cleanup();
  }
});

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
      /Laravel returned HTTP 500/
    );
  } finally {
    killTrackedPreview(project.id);
    await fakePhp.cleanup();
    await fakeNpm.cleanup();
    await cleanup();
  }
});

test("started preview servers are proxied through the desktop bridge", async () => {
  const { project, cleanup } = await makeProject("vibyra-preview-proxy-");
  const vite = await makeViteLikeServer("window.__vite = true;");
  const app = await makeViteLikeServer([
    "<!doctype html><html><head>",
    '<script type="module" src="/assets/app.js"></script>',
    `<script type="module">import RefreshRuntime from "http://0.0.0.0:${vite.port}/@react-refresh";</script>`,
    '<script type="application/json">{"asset":"/raw-json.png"}</script>',
    '<div style="background-image: url(\'/hero-neon-background.png\')"></div>',
    `<script type="module" src="http://0.0.0.0:${vite.port}/@vite/client"></script>`,
    "</head><body>proxied</body></html>"
  ].join(""));
  try {
    appState.previewServers[project.id] = {
      command: "test preview",
      proxyTargetUrl: `http://0.0.0.0:${app.port}`,
      startedAt: new Date().toISOString(),
      url: `http://192.168.1.20:${app.port}`
    };

    const response = await requestPreviewServerProxy(project);
    assert.equal(response.status, 200);
    assert.match(response.body, new RegExp(`${escapeRegExp(previewServerProxyUrl(project.id, TOKEN))}assets/app\\.js`));
    assert.match(response.body, new RegExp(`url\\('${escapeRegExp(previewServerProxyUrl(project.id, TOKEN))}hero-neon-background\\.png'\\)`));
    assert.match(response.body, /\/preview\/proxy-url\//);
    assert.match(response.body, /127\.0\.0\.1/);
    assert.doesNotMatch(response.body, /0\.0\.0\.0/);
    assert.match(response.body, /"asset":"\/raw-json\.png"/);
    assert.doesNotMatch(response.body, /src="\/assets\/app\.js"/);
    assert.doesNotMatch(response.body, /src="http:\/\/127\.0\.0\.1/);

    const asset = await requestPreviewServerProxy(project, "assets/app.js");
    assert.equal(asset.status, 200);
    assert.match(asset.body, /proxied/);

    const external = await requestPreviewUrlProxy(`http://0.0.0.0:${vite.port}/@vite/client`);
    assert.equal(external.status, 200);
    assert.match(external.body, /__vite/);
  } finally {
    delete appState.previewServers[project.id];
    await app.close();
    await vite.close();
    await cleanup();
  }
});

test("preview server proxy rewrites runtime root asset strings in JavaScript", async () => {
  const { project, cleanup } = await makeProject("vibyra-preview-js-assets-");
  const app = await makeRouteServer({
    "/": {
      contentType: "text/html; charset=utf-8",
      body: '<!doctype html><html><body><script type="module" src="/resources/js/app.tsx"></script></body></html>'
    },
    "/resources/js/app.tsx": {
      contentType: "application/javascript; charset=utf-8",
      body: [
        'const model = "/AllIn1.glb";',
        "const resume = '/AIResume.png?v=1#download';",
        "const background = \"url('/Spin.png')\";",
        "const remote = 'https://example.com/remote.png';"
      ].join("\n")
    }
  });
  try {
    appState.previewServers[project.id] = {
      command: "test preview",
      proxyTargetUrl: `http://0.0.0.0:${app.port}`,
      startedAt: new Date().toISOString(),
      url: `http://192.168.1.20:${app.port}`
    };

    const js = await requestPreviewServerProxy(project, "resources/js/app.tsx");
    assert.equal(js.status, 200);
    assert.doesNotMatch(js.body, /["'`]\/(?:AllIn1\.glb|AIResume\.png|Spin\.png)/);
    assert.match(js.body, new RegExp(`${escapeRegExp(previewServerProxyUrl(project.id, TOKEN))}AllIn1\\.glb`));
    assert.match(js.body, new RegExp(`${escapeRegExp(previewServerProxyUrl(project.id, TOKEN))}AIResume\\.png\\?v=1#download`));
    assert.match(js.body, new RegExp(`url\\('${escapeRegExp(previewServerProxyUrl(project.id, TOKEN))}Spin\\.png'\\)`));
    assert.match(js.body, /https:\/\/example\.com\/remote\.png/);
  } finally {
    delete appState.previewServers[project.id];
    await app.close();
    await cleanup();
  }
});

test("preview referer fallback proxies root app paths before phone auth", async () => {
  const { project, cleanup } = await makeProject("vibyra-preview-referer-fallback-");
  const app = await makeRouteServer({
    "/AllIn1.glb": { contentType: "model/gltf-binary", body: Buffer.from("glb") },
    "/projects": { contentType: "text/html; charset=utf-8", body: "<!doctype html><html><body>Projects route</body></html>" }
  });
  try {
    appState.previewServers[project.id] = {
      command: "test preview",
      proxyTargetUrl: `http://0.0.0.0:${app.port}`,
      startedAt: new Date().toISOString(),
      url: `http://192.168.1.20:${app.port}`
    };

    const referer = `http://vibyra.test${previewServerProxyUrl(project.id, TOKEN)}`;
    const model = await requestPreviewRefererAsset("/AllIn1.glb", referer);
    assert.equal(model.status, 200);
    assert.equal(model.headers["Content-Type"], "model/gltf-binary");
    assert.equal(model.body, "glb");

    const route = await requestPreviewRefererAsset("/projects", referer);
    assert.equal(route.status, 200);
    assert.match(route.body, /Projects route/);

    const untrusted = await requestPreviewRefererAsset("/AllIn1.glb", "http://vibyra.test/");
    assert.equal(untrusted.served, false);
  } finally {
    delete appState.previewServers[project.id];
    await app.close();
    await cleanup();
  }
});

test("external preview proxy rewrites nested Vite imports and assets against the upstream server", async () => {
  const vite = await makeRouteServer({
    "/@vite/client": {
      contentType: "application/javascript; charset=utf-8",
      body: [
        'import "/@vite/env";',
        'import RefreshRuntime from "/node_modules/@vite/client.js";',
        'import("/resources/js/app.tsx?t=123");',
        "transport.connect(createHMRHandler(handleMessage));",
        "setupForwardConsoleHandler(transport, forwardConsole);",
        "window.__vite = true;"
      ].join("\n")
    },
    "/@vite/env": { contentType: "application/javascript; charset=utf-8", body: "window.__vite_env = true;" },
    "/node_modules/@vite/client.js": { contentType: "application/javascript; charset=utf-8", body: "export default {};" },
    "/resources/js/app.tsx": { contentType: "application/javascript; charset=utf-8", body: 'import "/resources/js/bootstrap.ts";' },
    "/resources/js/bootstrap.ts": { contentType: "application/javascript; charset=utf-8", body: "window.__bootstrap = true;" },
    "/resources/css/app.css": {
      contentType: "text/css; charset=utf-8",
      body: '@import "/resources/css/theme.css"; .hero { background: url("/resources/img/bg.png"); } .cdn { background: url("//cdn.example.com/bg.png"); }'
    },
    "/resources/css/theme.css": { contentType: "text/css; charset=utf-8", body: "body { color: red; }" },
    "/resources/img/bg.png": { contentType: "image/png", body: Buffer.from("png") }
  });
  try {
    const js = await requestPreviewUrlProxy(`http://0.0.0.0:${vite.port}/@vite/client`);
    assert.equal(js.status, 200);
    assert.doesNotMatch(js.body, /0\.0\.0\.0/);
    assert.doesNotMatch(js.body, /["'`]\/(?:@vite|node_modules|resources)\//);
    assert.match(js.body, /\/preview\/proxy-url\//);
    assert.match(js.body, /127\.0\.0\.1/);
    assert.match(js.body, /if \(!import\.meta\.url\.includes\("\/preview\/proxy-url\/"\)\)/);

    const envPath = proxyPathFor(js.body, "%2F%40vite%2Fenv");
    const env = await requestPreviewProxyPath(envPath);
    assert.equal(env.status, 200);
    assert.match(env.body, /__vite_env/);

    const appPath = proxyPathFor(js.body, "%2Fresources%2Fjs%2Fapp.tsx");
    assert.match(appPath, /%3Ft%3D123/);
    const app = await requestPreviewProxyPath(appPath);
    assert.equal(app.status, 200);
    assert.match(app.body, /%2Fresources%2Fjs%2Fbootstrap\.ts/);
    assert.doesNotMatch(app.body, /import "\/resources/);

    const bootstrap = await requestPreviewProxyPath(proxyPathFor(app.body, "%2Fresources%2Fjs%2Fbootstrap.ts"));
    assert.equal(bootstrap.status, 200);
    assert.match(bootstrap.body, /__bootstrap/);

    const css = await requestPreviewUrlProxy(`http://0.0.0.0:${vite.port}/resources/css/app.css`);
    assert.equal(css.status, 200);
    assert.doesNotMatch(css.body, /0\.0\.0\.0/);
    assert.match(css.body, /%2Fresources%2Fcss%2Ftheme\.css/);
    assert.match(css.body, /%2Fresources%2Fimg%2Fbg\.png/);
    assert.match(css.body, /\/\/cdn\.example\.com\/bg\.png/);

    const theme = await requestPreviewProxyPath(proxyPathFor(css.body, "%2Fresources%2Fcss%2Ftheme.css"));
    assert.equal(theme.status, 200);
    assert.match(theme.body, /color: red/);
  } finally {
    await vite.close();
  }
});

test("approved preview server start rejects unsafe matching scripts", async () => {
  const { project, cleanup } = await makeProject("vibyra-preview-start-unsafe-");
  try {
    await writeFile(join(project.path, "package.json"), JSON.stringify({
      scripts: { dev: "next dev && echo unsafe" },
      dependencies: { next: "latest", react: "latest", "react-dom": "latest" }
    }));

    await assert.rejects(
      () => startProjectDevServer(project, "127.0.0.1:4317", { timeoutMs: 800 }),
      /recognized web dev script/
    );
  } finally {
    await cleanup();
  }
});

test("approved preview server start avoids an occupied declared port", async () => {
  const { project, cleanup } = await makeProject("vibyra-preview-start-occupied-port-");
  const fakeNpm = await makeFakeNpm();
  const occupied = await occupyPort();
  const html = '<!doctype html><html><body><script type="module" src="/src/main.tsx"></script></body></html>';
  try {
    await writeFile(join(project.path, "package.json"), JSON.stringify({
      scripts: { dev: `vite --port ${occupied.port} --strictPort` },
      devDependencies: { vite: "latest" }
    }));

    const result = await startProjectDevServer(project, "127.0.0.1:4317", {
      env: {
        PATH: `${fakeNpm.bin}:${process.env.PATH ?? ""}`,
        VIBYRA_FAKE_PREVIEW_HTML: html
      },
      timeoutMs: 6000
    });
    assert.notEqual(new URL(result.url).port, String(occupied.port));
    assert.match(result.command, /--port \d+/);
  } finally {
    appState.previewServers[project.id]?.process?.kill();
    delete appState.previewServers[project.id];
    await occupied.close();
    await fakeNpm.cleanup();
    await cleanup();
  }
});

test("desktop preview skips source-only Vite entries in non-build roots", async () => {
  for (const entry of ["web/index.html", "app/index.html"]) {
    const { project, cleanup } = await makeProject(`vibyra-preview-source-${entry.replace(/[^a-z0-9]+/gi, "-")}`);
    try {
      await mkdir(join(project.path, dirname(entry), "src"), { recursive: true });
      await writeFile(join(project.path, entry), '<!doctype html><html><body><script type="module" src="/src/main.tsx"></script></body></html>');
      await writeFile(join(project.path, dirname(entry), "src", "main.tsx"), "console.log('source only');");

      const response = await requestPreview(project);
      assert.equal(response.status, 404);
      assert.match(response.body, /No runnable preview found/);
      assert.doesNotMatch(response.body, /main\.tsx/);
    } finally {
      await cleanup();
    }
  }
});

test("desktop preview rewrites nested page absolute assets to the build root", async () => {
  const { project, cleanup } = await makeProject("vibyra-preview-nested-page-");
  try {
    await mkdir(join(project.path, "dist", "pages", "about"), { recursive: true });
    await mkdir(join(project.path, "dist", "assets"), { recursive: true });
    await writeFile(join(project.path, "dist", "index.html"), "<!doctype html><html><body>home</body></html>");
    await writeFile(join(project.path, "dist", "pages", "about", "index.html"), '<!doctype html><html><body><script src="/assets/app.js"></script><script src="./local.js"></script></body></html>');
    await writeFile(join(project.path, "dist", "assets", "app.js"), 'console.log("mount root");');
    await writeFile(join(project.path, "dist", "pages", "about", "local.js"), 'console.log("document root");');

    const response = await requestPreview(project, "dist/pages/about/index.html");
    const base = `/preview/project/${encodeURIComponent(project.id)}/${encodeURIComponent(TOKEN)}/`;
    assert.equal(response.status, 200);
    assert.match(response.body, new RegExp(`${escapeRegExp(base)}dist/assets/app\\.js`));
    assert.match(response.body, new RegExp(`${escapeRegExp(base)}dist/pages/about/local\\.js`));
  } finally {
    await cleanup();
  }
});

test("desktop preview resolves existing folder ids without cached project state", async () => {
  const { project, cleanup } = await makeProject("vibyra-preview-encoded-");
  try {
    await mkdir(join(project.path, "assets"), { recursive: true });
    await writeFile(join(project.path, "index.html"), '<!doctype html><html><body><script src="/assets/app.js"></script></body></html>');
    await writeFile(join(project.path, "assets", "app.js"), 'console.log("encoded id");');

    const response = await requestPreview(project, "", { cacheProject: false });
    assert.equal(response.status, 200);
    assert.match(response.body, /assets\/app\.js/);
  } finally {
    await cleanup();
  }
});

test("desktop preview blocks project traversal and returns placeholder images for missing image assets", async () => {
  const { project, cleanup } = await makeProject("vibyra-preview-safety-");
  try {
    await writeFile(join(project.path, "index.html"), "<!doctype html><html><body>safe</body></html>");

    const traversal = await requestPreview(project, "..%2Foutside.txt");
    assert.equal(traversal.status, 404);
    assert.match(traversal.body, /Preview file missing/);

    for (const extension of ["png", "avif", "ico"]) {
      const image = await requestPreview(project, `missing/sprite.${extension}`);
      assert.equal(image.status, 200);
      assert.equal(image.headers["Content-Type"], "image/svg+xml; charset=utf-8");
      assert.match(image.body, /Image asset not included/);
    }
  } finally {
    await cleanup();
  }
});

test("desktop preview serves important asset MIME types", async () => {
  const { project, cleanup } = await makeProject("vibyra-preview-mime-");
  try {
    await writeFile(join(project.path, "index.html"), "<!doctype html><html><body>mime</body></html>");
    await writeFile(join(project.path, "module.wasm"), "wasm");
    await writeFile(join(project.path, "favicon.ico"), "ico");
    await writeFile(join(project.path, "site.webmanifest"), "{}");
    await writeFile(join(project.path, "app.js.map"), "{}");

    assert.equal((await requestPreview(project, "module.wasm")).headers["Content-Type"], "application/wasm");
    assert.equal((await requestPreview(project, "favicon.ico")).headers["Content-Type"], "image/x-icon");
    assert.equal((await requestPreview(project, "site.webmanifest")).headers["Content-Type"], "application/manifest+json; charset=utf-8");
    assert.equal((await requestPreview(project, "app.js.map")).headers["Content-Type"], "application/json; charset=utf-8");
  } finally {
    await cleanup();
  }
});

async function makeProject(prefix) {
  const path = await mkdtemp(join(tmpdir(), prefix));
  const project = {
    id: Buffer.from(path).toString("base64url"),
    name: prefix.replace(/-$/, ""),
    path,
    stack: "Node / React",
    updated: "Now",
    source: "desktop",
    analysis: { summary: "Test project" }
  };
  return { project, cleanup: () => rm(path, { recursive: true, force: true }) };
}

async function makeViteLikeServer(rootHtml) {
  const server = createServer((req, res) => {
    if (req.url === "/@vite/client") {
      res.writeHead(200, { "Content-Type": "application/javascript; charset=utf-8" });
      res.end("window.__vite_plugin_react_preamble_installed__ = true;");
      return;
    }
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(rootHtml);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  return {
    port: typeof address === "object" && address ? address.port : 0,
    close: () => new Promise((resolve) => server.close(resolve))
  };
}

async function makeRouteServer(routes) {
  const server = createServer((req, res) => {
    const pathname = new URL(req.url ?? "/", "http://127.0.0.1").pathname;
    const route = routes[pathname];
    if (!route) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("missing");
      return;
    }
    res.writeHead(200, { "Content-Type": route.contentType });
    res.end(route.body);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  return {
    port: typeof address === "object" && address ? address.port : 0,
    close: () => new Promise((resolve) => server.close(resolve))
  };
}

async function makeFakeNpm() {
  const bin = await mkdtemp(join(tmpdir(), "vibyra-fake-npm-"));
  const npmPath = join(bin, "npm");
  await writeFile(npmPath, [
    "#!/usr/bin/env node",
    "import { createServer } from 'node:http';",
    "const portArgIndex = process.argv.lastIndexOf('--port');",
    "const argPort = portArgIndex >= 0 ? Number(process.argv[portArgIndex + 1]) : 0;",
    "const html = process.env.VIBYRA_FAKE_PREVIEW_HTML || process.env.VIBYRA_FAKE_VITE_HTML;",
    "const port = Number(process.env.VIBYRA_FAKE_PREVIEW_PORT || process.env.VIBYRA_FAKE_VITE_PORT || process.env.PORT || argPort);",
    "const delay = Number(process.env.VIBYRA_FAKE_VITE_DELAY_MS || 0);",
    "const server = createServer((req, res) => {",
    "  if (req.url === '/@vite/client') {",
    "    res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8' });",
    "    res.end('window.__vite_plugin_react_preamble_installed__ = true;');",
    "    return;",
    "  }",
    "  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });",
    "  res.end(html);",
    "});",
    "setTimeout(() => server.listen(port, '0.0.0.0', () => {",
    "  if (process.env.VIBYRA_FAKE_VITE_DECORATED_OUTPUT) {",
    "    console.log(`\\x1b[32m→\\x1b[39m \\x1b[1mLocal\\x1b[22m: \\x1b[36mhttp:// localhost:\\x1b[1m${port}\\x1b[22m/\\x1b[39m`);",
    "    console.log(`\\x1b[32m→\\x1b[39m \\x1b[1mNetwork\\x1b[22m: \\x1b[36mhttp:// 192.168.1.109:\\x1b[1m${port} \\x1b[22m/\\x1b[39m`);",
    "  } else if (process.env.VIBYRA_FAKE_OUTPUT_MODE === 'next') {",
    "    console.log(`ready - started server on 0.0.0.0:${port}, url: http://localhost:${port}`);",
    "  } else {",
    "    console.log(`Local: http://127.0.0.1:${port}/`);",
    "  }",
    "}), delay);",
    "setInterval(() => {}, 1000);"
  ].join("\n"));
  await chmod(npmPath, 0o755);
  return { bin, cleanup: () => rm(bin, { recursive: true, force: true }) };
}

async function makeFakePhp() {
  const bin = await mkdtemp(join(tmpdir(), "vibyra-fake-php-"));
  const phpPath = join(bin, "php");
  await writeFile(phpPath, [
    "#!/usr/bin/env node",
    "import { createServer } from 'node:http';",
    "const portArgIndex = process.argv.lastIndexOf('--port');",
    "const port = Number(process.env.VIBYRA_FAKE_LARAVEL_PORT || process.argv[portArgIndex + 1]);",
    "const html = process.env.VIBYRA_FAKE_LARAVEL_HTML || '<!doctype html><html><body>Laravel</body></html>';",
    "const status = Number(process.env.VIBYRA_FAKE_LARAVEL_STATUS || 200);",
    "const delay = Number(process.env.VIBYRA_FAKE_LARAVEL_DELAY_MS || 0);",
    "const server = createServer((req, res) => {",
    "  res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8' });",
    "  res.end(html);",
    "});",
    "setTimeout(() => server.listen(port, '0.0.0.0', () => {",
    "  console.log(`INFO  Server running on [http://127.0.0.1:${port}]`);",
    "}), delay);",
    "setInterval(() => {}, 1000);"
  ].join("\n"));
  await chmod(phpPath, 0o755);
  return { bin, cleanup: () => rm(bin, { recursive: true, force: true }) };
}

function killTrackedPreview(projectId) {
  const tracked = appState.previewServers[projectId];
  for (const child of [tracked?.process, ...(tracked?.processes ?? [])]) {
    try { child?.kill(); } catch {}
  }
  delete appState.previewServers[projectId];
}

async function findFreePort() {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  await new Promise((resolve) => server.close(resolve));
  return typeof address === "object" && address ? address.port : 5173;
}

async function occupyPort() {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, "0.0.0.0", resolve));
  const address = server.address();
  return {
    port: typeof address === "object" && address ? address.port : 0,
    close: () => new Promise((resolve) => server.close(resolve))
  };
}

async function requestPreview(project, path = "", { cacheProject = true, host = "vibyra.test" } = {}) {
  const previousProjects = appState.cachedProjects;
  appState.cachedProjects = cacheProject ? [project] : [];
  try {
    const url = new URL(`/preview/project/${encodeURIComponent(project.id)}/${encodeURIComponent(TOKEN)}/${path}`, `http://${host}`);
    const response = { status: 0, headers: {}, body: "" };
    const res = {
      writeHead(status, headers) {
        response.status = status;
        response.headers = headers;
      },
      end(body) {
        response.body = Buffer.isBuffer(body) ? body.toString("utf8") : String(body ?? "");
      }
    };
    await serveProjectPreview(res, url);
    return response;
  } finally {
    appState.cachedProjects = previousProjects;
  }
}

async function requestPreviewServerProxy(project, path = "", host = "vibyra.test") {
  const url = new URL(`${previewServerProxyUrl(project.id, TOKEN)}${path}`, `http://${host}`);
  return await requestPreviewRoute(url, servePreviewServerProxy);
}

async function requestPreviewUrlProxy(target, host = "vibyra.test") {
  const url = new URL(`/preview/proxy-url/${encodeURIComponent(TOKEN)}/?url=${encodeURIComponent(target)}`, `http://${host}`);
  return await requestPreviewRoute(url, servePreviewUrlProxy);
}

async function requestPreviewProxyPath(path, host = "vibyra.test") {
  return await requestPreviewRoute(new URL(path, `http://${host}`), servePreviewUrlProxy);
}

async function requestPreviewRefererAsset(path, referer, host = "vibyra.test") {
  const response = await requestPreviewRoute(new URL(path, `http://${host}`), (res, url) => {
    return servePreviewRefererAsset(res, url, referer);
  });
  return { ...response, served: response.status !== 0 };
}

async function requestPreviewRoute(url, handler) {
  const response = { status: 0, headers: {}, body: "" };
  const res = {
    writeHead(status, headers) {
      response.status = status;
      response.headers = headers;
    },
    end(body) {
      response.body = Buffer.isBuffer(body) ? body.toString("utf8") : String(body ?? "");
    }
  };
  await handler(res, url);
  return response;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function proxyPathFor(body, encodedPath) {
  const match = body.match(new RegExp(`(/preview/proxy-url/[^"'\\s)]+${escapeRegExp(encodedPath)}[^"'\\s)]*)`));
  assert.ok(match?.[1], `Expected proxy URL for ${encodedPath}`);
  return match[1];
}
