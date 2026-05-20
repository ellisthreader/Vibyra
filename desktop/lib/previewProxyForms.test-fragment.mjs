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

test("preview server proxy derives decoded Laravel XSRF header from preview cookies", async () => {
  const { project, cleanup } = await makeProject("vibyra-preview-xsrf-cookie-");
  const received = {};
  const app = createServer((req, res) => {
    if (req.url === "/login" && req.method === "POST") {
      received.csrf = req.headers["x-xsrf-token"];
      res.writeHead(204, { "Content-Type": "text/plain; charset=utf-8" });
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
      body: "{}",
      headers: {
        "content-type": "application/json",
        "cookie": "XSRF-TOKEN=csrf%3Dtoken; hke_session=old"
      },
      method: "POST"
    });
    assert.equal(response.status, 204);
    assert.equal(received.csrf, "csrf=token");

    const encodedHeader = await requestPreviewServerProxy(project, "login", "vibyra.test", {
      body: "{}",
      headers: {
        "content-type": "application/json",
        "cookie": "XSRF-TOKEN=ignored",
        "x-xsrf-token": "header%3Dtoken"
      },
      method: "POST"
    });
    assert.equal(encodedHeader.status, 204);
    assert.equal(received.csrf, "header=token");
  } finally {
    delete appState.previewServers[project.id];
    await new Promise((resolve) => app.close(resolve));
    await cleanup();
  }
});

test("preview server proxy rewrites browser form actions into the tokenized preview route", async () => {
  const { project, cleanup } = await makeProject("vibyra-preview-form-action-");
  const app = await makeRouteServer({
    "/login": {
      contentType: "text/html; charset=utf-8",
      body: '<!doctype html><html><body><form action="/login" method="post"><button formaction="/logout">Out</button></form></body></html>'
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
    assert.equal(response.status, 200);
    assert.match(response.body, new RegExp(`action="${escapeRegExp(previewServerProxyUrl(project.id, TOKEN))}login"`));
    assert.match(response.body, new RegExp(`formaction="${escapeRegExp(previewServerProxyUrl(project.id, TOKEN))}logout"`));
    assert.match(response.body, /previewRequestUrl/);
  } finally {
    delete appState.previewServers[project.id];
    await app.close();
    await cleanup();
  }
});

test("trusted preview referer can proxy root form posts before phone auth", async () => {
  const { project, cleanup } = await makeProject("vibyra-preview-root-post-");
  const received = {};
  const app = createServer((req, res) => {
    if (req.url === "/login" && req.method === "POST") {
      let body = "";
      req.on("data", (chunk) => { body += String(chunk); });
      req.on("end", () => {
        received.body = body;
        received.cookie = req.headers.cookie;
        res.writeHead(303, { "Content-Type": "text/html; charset=utf-8", "Location": "/dashboard" });
        res.end("");
      });
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

    const referer = `http://vibyra.test${previewServerProxyUrl(project.id, TOKEN)}login`;
    const response = await requestPreviewRefererAsset("/login", referer, "vibyra.test", {
      body: "_token=csrf",
      headers: { "content-type": "application/x-www-form-urlencoded", "cookie": "XSRF-TOKEN=csrf; hke_session=old" },
      method: "POST"
    });
    assert.equal(response.status, 303);
    assert.equal(response.headers.Location, `${previewServerProxyUrl(project.id, TOKEN)}dashboard`);
    assert.equal(received.body, "_token=csrf");
    assert.equal(received.cookie, "XSRF-TOKEN=csrf; hke_session=old");
  } finally {
    delete appState.previewServers[project.id];
    await new Promise((resolve) => app.close(resolve));
    await cleanup();
  }
});
