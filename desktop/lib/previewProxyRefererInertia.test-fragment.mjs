import test from "node:test";
import assert from "node:assert/strict";
import { chmod, mkdir, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { dirname, join } from "node:path";
import { appState, TOKEN } from "./state.mjs";
import { previewServerProxyUrl } from "./preview.mjs";
import { issuePreviewCapability, revokePreviewCapability } from "./previewCapabilities.mjs";
import { startProjectDevServer } from "./previewDevServer.mjs";
import { STATIC_PREVIEW_ENTRIES } from "./previewResolver.mjs";
import { escapeRegExp, findFreePort, killTrackedPreview, makeFakeNpm, makeFakePhp, makeProject, makeRouteServer, makeViteLikeServer, occupyPort, proxyPathFor, requestPreview, requestPreviewProxyPath, requestPreviewRefererAsset, requestPreviewServerProxy, requestPreviewUrlProxy, viteErrorHtml } from "./previewTestHelpers.mjs";

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

    const untrustedRoute = await requestPreviewRefererAsset("/desktop/state", "http://vibyra.test/");
    assert.equal(untrustedRoute.served, false);
  } finally {
    delete appState.previewServers[project.id];
    await app.close();
    await cleanup();
  }
});

test("root preview assets require an authenticated preview referer", async () => {
  const { project, cleanup } = await makeProject("vibyra-preview-root-assets-");
  const app = await makeRouteServer({
    "/build/assets/HomeLanding-DXTU5TCo.js": {
      contentType: "application/javascript; charset=utf-8",
      body: 'import "/build/assets/jsx-runtime-DTJ6URaS.js"; window.__page = true;'
    },
    "/build/assets/jsx-runtime-DTJ6URaS.js": {
      contentType: "application/javascript; charset=utf-8",
      body: "window.__jsx = true;"
    },
    "/images/aromatic-crispy-duck-sample.png": {
      contentType: "image/png",
      body: Buffer.from("png")
    },
    "/projects": {
      contentType: "text/html; charset=utf-8",
      body: "<!doctype html><html><body>Projects route</body></html>"
    }
  });
  try {
    appState.previewServers[project.id] = {
      command: "test preview",
      proxyTargetUrl: `http://0.0.0.0:${app.port}`,
      startedAt: new Date().toISOString(),
      url: `http://192.168.1.20:${app.port}`
    };

    const chunk = await requestPreviewRefererAsset("/build/assets/HomeLanding-DXTU5TCo.js", "");
    assert.equal(chunk.served, false);

    const nested = await requestPreviewRefererAsset("/build/assets/jsx-runtime-DTJ6URaS.js", "http://vibyra.test/build/assets/HomeLanding-DXTU5TCo.js");
    assert.equal(nested.served, false);

    const image = await requestPreviewRefererAsset("/images/aromatic-crispy-duck-sample.png", "");
    assert.equal(image.served, false);

    const route = await requestPreviewRefererAsset("/projects", "");
    assert.equal(route.served, false);
  } finally {
    delete appState.previewServers[project.id];
    await app.close();
    await cleanup();
  }
});

test("preview server proxy forwards Inertia login requests with body, cookies, and rewritten redirects", async () => {
  const { project, cleanup } = await makeProject("vibyra-preview-inertia-login-");
  const credential = issuePreviewCapability(project.id);
  const received = {};
  const app = createServer((req, res) => {
    if (req.url === "/login" && req.method === "POST") {
      let body = "";
      req.on("data", (chunk) => { body += String(chunk); });
      req.on("end", () => {
        received.method = req.method;
        received.body = body;
        received.cookie = req.headers.cookie;
        received.contentType = req.headers["content-type"];
        received.inertia = req.headers["x-inertia"];
        received.csrf = req.headers["x-xsrf-token"];
        received.origin = req.headers.origin;
        received.referer = req.headers.referer;
        received.forwardedHost = req.headers["x-forwarded-host"];
        received.forwardedPrefix = req.headers["x-forwarded-prefix"];
        res.writeHead(303, {
          "Content-Type": "text/html; charset=utf-8",
          "Location": "/dashboard",
          "Set-Cookie": [
            "hke_session=abc; Path=/; HttpOnly; SameSite=Lax",
            "XSRF-TOKEN=csrf-token; Path=/; Domain=127.0.0.1; Secure; SameSite=None"
          ],
          "X-Inertia": "true"
        });
        res.end("");
      });
      return;
    }
    if (req.url === "/external-redirect") {
      res.writeHead(409, {
        "Content-Type": "text/html; charset=utf-8",
        "X-Inertia-Location": "/billing"
      });
      res.end("");
      return;
    }
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("missing");
  });
  await new Promise((resolve) => app.listen(0, "127.0.0.1", resolve));
  const address = app.address();
  const port = typeof address === "object" && address ? address.port : 0;
  try {
    appState.previewServers[project.id] = {
      command: "test preview",
      proxyTargetUrl: `http://0.0.0.0:${port}`,
      startedAt: new Date().toISOString(),
      url: `http://192.168.1.20:${port}`
    };

    const response = await requestPreviewServerProxy(project, "login", "vibyra.test", {
      body: "_token=csrf&email=test%40example.com&password=secret",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        "cookie": "XSRF-TOKEN=csrf; hke_session=old",
        "origin": "http://vibyra.test",
        "referer": `http://vibyra.test${previewServerProxyUrl(project.id, credential)}login`,
        "x-inertia": "true",
        "x-requested-with": "XMLHttpRequest",
        "x-xsrf-token": "csrf"
      },
      method: "POST",
      token: credential
    });
    assert.equal(response.status, 303);
    assert.equal(response.headers.Location, `${previewServerProxyUrl(project.id, credential)}dashboard`);
    assert.deepEqual(response.headers["Set-Cookie"], [
      `hke_session=abc; HttpOnly; SameSite=Lax; Path=${previewServerProxyUrl(project.id, credential)}`,
      `XSRF-TOKEN=csrf-token; SameSite=Lax; Path=${previewServerProxyUrl(project.id, credential)}`
    ]);
    assert.equal(response.headers["x-inertia"], "true");
    assert.equal(received.method, "POST");
    assert.equal(received.body, "_token=csrf&email=test%40example.com&password=secret");
    assert.equal(received.cookie, "XSRF-TOKEN=csrf; hke_session=old");
    assert.equal(received.contentType, "application/x-www-form-urlencoded");
    assert.equal(received.inertia, "true");
    assert.equal(received.csrf, "csrf");
    assert.equal(received.origin, `http://127.0.0.1:${port}`);
    assert.equal(received.referer, `http://127.0.0.1:${port}/login`);
    assert.equal(received.forwardedHost, "vibyra.test");
    assert.equal(received.forwardedPrefix, previewServerProxyUrl(project.id, credential));

    const inertiaRedirect = await requestPreviewServerProxy(project, "external-redirect", "vibyra.test", {
      headers: { "x-inertia": "true" },
      token: credential
    });
    assert.equal(inertiaRedirect.status, 409);
    assert.equal(inertiaRedirect.headers["X-Inertia-Location"], `${previewServerProxyUrl(project.id, credential)}billing`);
  } finally {
    revokePreviewCapability(credential);
    delete appState.previewServers[project.id];
    await new Promise((resolve) => app.close(resolve));
    await cleanup();
  }
});
