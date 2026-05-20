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
