import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { appState } from "./state.mjs";
import { makeProject, makeRouteServer, requestPreviewServerProxy } from "./previewTestHelpers.mjs";

test("preview proxy rejects oversized request bodies before contacting upstream", async () => {
  const { project, cleanup } = await makeProject("vibyra-preview-request-limit-");
  let requests = 0;
  const app = await makeRouteServer({
    "/submit": (_req, res) => {
      requests += 1;
      res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("ok");
    }
  });
  const previous = process.env.VIBYRA_PREVIEW_PROXY_MAX_REQUEST_BODY_BYTES;
  try {
    process.env.VIBYRA_PREVIEW_PROXY_MAX_REQUEST_BODY_BYTES = "4";
    trackPreview(project.id, app.port);
    const response = await requestPreviewServerProxy(project, "submit", "vibyra.test", {
      body: "12345",
      headers: { "content-length": "5", "content-type": "text/plain" },
      method: "POST"
    });
    assert.equal(response.status, 413);
    assert.equal(requests, 0);
  } finally {
    restoreEnv("VIBYRA_PREVIEW_PROXY_MAX_REQUEST_BODY_BYTES", previous);
    delete appState.previewServers[project.id];
    await app.close();
    await cleanup();
  }
});

test("preview proxy rejects upstream responses above the configured size", async () => {
  const { project, cleanup } = await makeProject("vibyra-preview-response-limit-");
  const app = await makeRouteServer({
    "/large.txt": { contentType: "text/plain; charset=utf-8", body: "12345" }
  });
  const previous = process.env.VIBYRA_PREVIEW_PROXY_MAX_RESPONSE_BODY_BYTES;
  try {
    process.env.VIBYRA_PREVIEW_PROXY_MAX_RESPONSE_BODY_BYTES = "4";
    trackPreview(project.id, app.port);
    const response = await requestPreviewServerProxy(project, "large.txt");
    assert.equal(response.status, 502);
    assert.match(response.body, /Preview response too large/);
  } finally {
    restoreEnv("VIBYRA_PREVIEW_PROXY_MAX_RESPONSE_BODY_BYTES", previous);
    delete appState.previewServers[project.id];
    await app.close();
    await cleanup();
  }
});

test("preview proxy terminates chunked responses that cross the size limit", async () => {
  const { project, cleanup } = await makeProject("vibyra-preview-chunked-limit-");
  const app = await makeRouteServer({
    "/large.bin": (_req, res) => {
      res.writeHead(200, { "Content-Type": "application/octet-stream" });
      res.write("abc");
      setTimeout(() => res.end("def"), 5);
    }
  });
  const previous = process.env.VIBYRA_PREVIEW_PROXY_MAX_RESPONSE_BODY_BYTES;
  try {
    process.env.VIBYRA_PREVIEW_PROXY_MAX_RESPONSE_BODY_BYTES = "4";
    trackPreview(project.id, app.port);
    const response = await requestPreviewServerProxy(project, "large.bin");
    assert.equal(response.status, 200);
    assert.equal(response.error?.code, "PREVIEW_PROXY_RESPONSE_TOO_LARGE");
  } finally {
    restoreEnv("VIBYRA_PREVIEW_PROXY_MAX_RESPONSE_BODY_BYTES", previous);
    delete appState.previewServers[project.id];
    await app.close();
    await cleanup();
  }
});

test("preview proxy times out stalled upstream requests", async () => {
  const { project, cleanup } = await makeProject("vibyra-preview-timeout-");
  const app = await makeRouteServer({
    "/slow": (_req, res) => {
      setTimeout(() => {
        if (res.destroyed) return;
        res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("late");
      }, 100);
    }
  });
  const previous = process.env.VIBYRA_PREVIEW_PROXY_UPSTREAM_TIMEOUT_MS;
  try {
    process.env.VIBYRA_PREVIEW_PROXY_UPSTREAM_TIMEOUT_MS = "25";
    trackPreview(project.id, app.port);
    const response = await requestPreviewServerProxy(project, "slow");
    assert.equal(response.status, 504);
    assert.match(response.body, /Preview server timed out/);
  } finally {
    restoreEnv("VIBYRA_PREVIEW_PROXY_UPSTREAM_TIMEOUT_MS", previous);
    delete appState.previewServers[project.id];
    await app.close();
    await cleanup();
  }
});

test("preview proxy enforces the configured concurrency limit", async () => {
  const { project, cleanup } = await makeProject("vibyra-preview-concurrency-");
  const server = createServer((_req, res) => {
    setTimeout(() => {
      res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("done");
    }, 75);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  const previousConcurrency = process.env.VIBYRA_PREVIEW_PROXY_MAX_CONCURRENCY;
  const previousTimeout = process.env.VIBYRA_PREVIEW_PROXY_UPSTREAM_TIMEOUT_MS;
  try {
    process.env.VIBYRA_PREVIEW_PROXY_MAX_CONCURRENCY = "1";
    process.env.VIBYRA_PREVIEW_PROXY_UPSTREAM_TIMEOUT_MS = "500";
    trackPreview(project.id, port);
    const first = requestPreviewServerProxy(project, "first");
    await new Promise((resolve) => setTimeout(resolve, 10));
    const second = await requestPreviewServerProxy(project, "second");
    assert.equal(second.status, 503);
    assert.match(second.body, /Preview proxy busy/);
    assert.equal((await first).status, 200);
  } finally {
    restoreEnv("VIBYRA_PREVIEW_PROXY_MAX_CONCURRENCY", previousConcurrency);
    restoreEnv("VIBYRA_PREVIEW_PROXY_UPSTREAM_TIMEOUT_MS", previousTimeout);
    delete appState.previewServers[project.id];
    await new Promise((resolve) => server.close(resolve));
    await cleanup();
  }
});

test("preview proxy streams binary bodies while preserving range headers", async () => {
  const { project, cleanup } = await makeProject("vibyra-preview-streaming-");
  const app = await makeRouteServer({
    "/video.mp4": (_req, res) => {
      res.writeHead(206, {
        "Accept-Ranges": "bytes",
        "Content-Length": "6",
        "Content-Range": "bytes 0-5/12",
        "Content-Type": "video/mp4"
      });
      res.write("abc");
      setTimeout(() => res.end("def"), 5);
    }
  });
  try {
    trackPreview(project.id, app.port);
    const response = await requestPreviewServerProxy(project, "video.mp4", "vibyra.test", {
      headers: { range: "bytes=0-5" }
    });
    assert.equal(response.status, 206);
    assert.equal(response.headers["Accept-Ranges"], "bytes");
    assert.equal(response.headers["Content-Range"], "bytes 0-5/12");
    assert.equal(response.headers["Content-Length"], "6");
    assert.equal(response.body, "abcdef");
  } finally {
    delete appState.previewServers[project.id];
    await app.close();
    await cleanup();
  }
});

function trackPreview(projectId, port) {
  appState.previewServers[projectId] = {
    proxyTargetUrl: `http://127.0.0.1:${port}`,
    url: `http://127.0.0.1:${port}`
  };
}

function restoreEnv(name, value) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}
