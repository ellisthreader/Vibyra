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
    assert.match(response.body, /vibyra-preview-runtime-error/);
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

test("preview server proxy injects runtime error overlay once before app scripts", async () => {
  const { project, cleanup } = await makeProject("vibyra-preview-runtime-overlay-");
  const app = await makeRouteServer({
    "/": {
      contentType: "text/html; charset=utf-8",
      body: [
        "<!doctype html><html><head>",
        '<script>window.__headScript = true;</script>',
        '<script type="module" src="/assets/app.js"></script>',
        "</head><body><div id=\"app\"></div></body></html>"
      ].join("")
    }
  });
  try {
    appState.previewServers[project.id] = {
      command: "test preview",
      proxyTargetUrl: `http://0.0.0.0:${app.port}`,
      startedAt: new Date().toISOString(),
      url: `http://192.168.1.20:${app.port}`
    };

    const response = await requestPreviewServerProxy(project);
    assert.equal(response.status, 200);
    assert.equal((response.body.match(/__vibyraPreviewRuntimeErrorOverlay/g) ?? []).length, 2);
    assert.ok(response.body.indexOf("__vibyraPreviewRuntimeErrorOverlay") < response.body.indexOf("__headScript"));
    assert.match(response.body, /Preview runtime error/);
    assert.match(response.body, /__vibyraPreviewFetchOverlay/);
    assert.match(response.body, /__vibyraPreviewXhrOverlay/);
    assert.match(response.body, /responseDiagnosticText/);
    assert.match(response.body, /querySelectorAll\(selector\)/);
  } finally {
    delete appState.previewServers[project.id];
    await app.close();
    await cleanup();
  }
});

test("preview server proxy renders HTTP error pages as visible diagnostics", async () => {
  const { project, cleanup } = await makeProject("vibyra-preview-http-error-");
  const app = await makeRouteServer({
    "/login": {
      contentType: "text/html; charset=utf-8",
      status: 419,
      body: "<!doctype html><html><head><title>Page Expired</title></head><body><h1>Page Expired</h1><p>CSRF token mismatch.</p></body></html>"
    }
  });
  try {
    appState.previewServers[project.id] = {
      command: "test preview",
      proxyTargetUrl: `http://0.0.0.0:${app.port}`,
      startedAt: new Date().toISOString(),
      url: `http://192.168.1.20:${app.port}`
    };

    const response = await requestPreviewServerProxy(project, "login");
    assert.equal(response.status, 419);
    assert.match(response.body, /vibyra-preview-http-error/);
    assert.match(response.body, /Preview HTTP error/);
    assert.match(response.body, /HTTP 419/);
    assert.match(response.body, /CSRF token mismatch/);
    assert.match(response.body, /responseDiagnosticText/);
  } finally {
    delete appState.previewServers[project.id];
    await app.close();
    await cleanup();
  }
});

test("static preview links fall forward to a tracked preview server", async () => {
  const { project, cleanup } = await makeProject("vibyra-preview-project-fallback-");
  try {
    appState.previewServers[project.id] = {
      command: "test preview",
      proxyTargetUrl: "http://127.0.0.1:8001",
      startedAt: new Date().toISOString(),
      url: "http://192.168.1.20:8001"
    };

    const response = await requestPreview(project);
    assert.equal(response.status, 302);
    assert.equal(response.headers.Location, previewServerProxyUrl(project.id, TOKEN));
  } finally {
    delete appState.previewServers[project.id];
    await cleanup();
  }
});
