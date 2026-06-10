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

test("Laravel Vite proxy keeps app routes and public media on the preview server", async () => {
  const { project, cleanup } = await makeProject("vibyra-preview-laravel-vite-proxy-");
  const appRoutes = {
    "/": {
      contentType: "text/html; charset=utf-8",
      body: ""
    },
    "/videos/logo.mp4": { contentType: "video/mp4", body: Buffer.from("mp4") }
  };
  const app = await makeRouteServer(appRoutes);
  appRoutes["/"].body = [
    "<!doctype html><html><head>",
    `<script type="text/javascript">const Ziggy={"url":"http:\\/\\/127.0.0.1:${app.port}","port":${app.port}}; const menu = "http://127.0.0.1:${app.port}/menu";</script>`,
    "</head><body>Laravel</body></html>"
  ].join("");
  const vite = await makeRouteServer({
    "/resources/js/app.tsx": {
      contentType: "application/javascript; charset=utf-8",
      body: [
        'import "/resources/js/bootstrap.ts";',
        'const logo = "/videos/logo.mp4";'
      ].join("\n")
    },
    "/resources/js/bootstrap.ts": { contentType: "application/javascript; charset=utf-8", body: "window.__bootstrap = true;" }
  });
  try {
    appState.previewServers[project.id] = {
      command: "test preview",
      proxyTargetUrl: `http://0.0.0.0:${app.port}`,
      startedAt: new Date().toISOString(),
      url: `http://192.168.1.20:${app.port}`,
      viteProxyTargetUrl: `http://0.0.0.0:${vite.port}`
    };

    const html = await requestPreviewServerProxy(project);
    assert.equal(html.status, 200);
    assert.match(html.body, new RegExp(`"url":"${escapeRegExp(previewServerProxyUrl(project.id, TOKEN).replace(/\/$/, ""))}"`));
    assert.doesNotMatch(html.body, new RegExp(`127\\.0\\.0\\.1:${app.port}`));

    const js = await requestPreviewUrlProxy(`http://0.0.0.0:${vite.port}/resources/js/app.tsx`);
    assert.equal(js.status, 200);
    assert.match(js.body, new RegExp(`${escapeRegExp(previewServerProxyUrl(project.id, TOKEN))}videos/logo\\.mp4`));
    assert.match(js.body, /%2Fresources%2Fjs%2Fbootstrap\.ts/);

    const media = await requestPreviewUrlProxy(`http://0.0.0.0:${vite.port}/videos/logo.mp4`);
    assert.equal(media.status, 200);
    assert.equal(media.headers["Content-Type"], "video/mp4");
    assert.equal(media.body, "mp4");
  } finally {
    delete appState.previewServers[project.id];
    await app.close();
    await vite.close();
    await cleanup();
  }
});

test("external preview proxy turns Vite module 500 HTML into executable diagnostics", async () => {
  const vite = await makeRouteServer({
    "/resources/js/app.tsx": {
      contentType: "application/octet-stream",
      status: 500,
      body: viteErrorHtml({
        message: 'Failed to resolve import "./Components/App" from "resources/js/app.tsx". Does the file exist?',
        id: "/tmp/example/resources/js/app.tsx",
        frame: '3  |  import { App } from "./Components/App";\n   |                       ^',
        plugin: "vite:import-analysis"
      })
    }
  });
  const projectId = "vite-module-error-preview-proxy";
  appState.previewServers[projectId] = {
    viteProxyTargetUrl: `http://0.0.0.0:${vite.port}`
  };
  try {
    const js = await requestPreviewUrlProxy(`http://0.0.0.0:${vite.port}/resources/js/app.tsx`);
    assert.equal(js.status, 200);
    assert.equal(js.headers["Content-Type"], "application/javascript; charset=utf-8");
    assert.match(js.body, /vibyra-preview-error/);
    assert.match(js.body, /Preview module failed/);
    assert.match(js.body, /Failed to resolve import/);
    assert.match(js.body, /postMessage/);
    assert.match(js.body, /export \{\};/);
  } finally {
    delete appState.previewServers[projectId];
    await vite.close();
  }
});

test("preview server proxy preserves range requests and media response headers", async () => {
  const { project, cleanup } = await makeProject("vibyra-preview-media-range-");
  let seenRange = "";
  const app = await makeRouteServer({
    "/videos/logo.mp4": (req, res) => {
      seenRange = String(req.headers.range || "");
      res.writeHead(206, {
        "Accept-Ranges": "bytes",
        "Content-Length": "3",
        "Content-Range": "bytes 0-2/6",
        "Content-Type": "video/mp4"
      });
      res.end(Buffer.from("mp4"));
    }
  });
  try {
    appState.previewServers[project.id] = {
      command: "test preview",
      proxyTargetUrl: `http://0.0.0.0:${app.port}`,
      startedAt: new Date().toISOString(),
      url: `http://192.168.1.20:${app.port}`
    };

    const media = await requestPreviewServerProxy(project, "videos/logo.mp4", "vibyra.test", {
      headers: { range: "bytes=0-2" }
    });
    assert.equal(seenRange, "bytes=0-2");
    assert.equal(media.status, 206);
    assert.equal(media.headers["Content-Type"], "video/mp4");
    assert.equal(media.headers["Accept-Ranges"], "bytes");
    assert.equal(media.headers["Content-Range"], "bytes 0-2/6");
    assert.equal(media.headers["Content-Length"], "3");
    assert.equal(media.body, "mp4");
  } finally {
    delete appState.previewServers[project.id];
    await app.close();
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

test("preview server proxy unwraps duplicated preview prefixes for runtime assets", async () => {
  const { project, cleanup } = await makeProject("vibyra-preview-duplicate-prefix-");
  const app = await makeRouteServer({
    "/AllIn1.glb": { contentType: "model/gltf-binary", body: Buffer.from("glb") }
  });
  try {
    appState.previewServers[project.id] = {
      command: "test preview",
      proxyTargetUrl: `http://0.0.0.0:${app.port}`,
      startedAt: new Date().toISOString(),
      url: `http://192.168.1.20:${app.port}`
    };

    const nestedPath = `${previewServerProxyUrl(project.id, TOKEN).replace(/^\/+/, "")}AllIn1.glb`;
    const model = await requestPreviewServerProxy(project, nestedPath);
    assert.equal(model.status, 200);
    assert.equal(model.headers["Content-Type"], "model/gltf-binary");
    assert.equal(model.body, "glb");
  } finally {
    delete appState.previewServers[project.id];
    await app.close();
    await cleanup();
  }
});
