import assert from "node:assert/strict";
import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { killCommandTree } from "./commandSpawn.mjs";
import { appState, TOKEN } from "./state.mjs";
import { previewServerProxyUrl, servePreviewRefererAsset, servePreviewServerProxy, servePreviewUrlProxy, serveProjectPreview } from "./preview.mjs";

export async function makeProject(prefix) {
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
  return { project, cleanup: () => rm(path, { force: true, maxRetries: 20, recursive: true, retryDelay: 100 }) };
}

export async function makeViteLikeServer(rootHtml) {
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

export async function makeRouteServer(routes) {
  const server = createServer((req, res) => {
    const pathname = new URL(req.url ?? "/", "http://127.0.0.1").pathname;
    const route = routes[pathname];
    if (!route) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("missing");
      return;
    }
    if (typeof route === "function") {
      route(req, res);
      return;
    }
    res.writeHead(route.status ?? 200, { "Content-Type": route.contentType, ...(route.headers ?? {}) });
    res.end(route.body);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  return {
    port: typeof address === "object" && address ? address.port : 0,
    close: () => new Promise((resolve) => server.close(resolve))
  };
}

export function viteErrorHtml(error) {
  return `
        <!DOCTYPE html>
        <html lang="en">
          <head>
            <meta charset="UTF-8" />
            <title>Error</title>
            <script type="module">
              const error = ${JSON.stringify({ ...error, stack: "at transform", loc: { file: error.id, line: 3, column: 20 } })}
              try {
                const { ErrorOverlay } = await import("/@vite/client")
                document.body.appendChild(new ErrorOverlay(error))
              } catch {}
            </script>
          </head>
          <body></body>
        </html>
      `;
}

export async function makeFakeCommand(name, script) {
  const bin = await mkdtemp(join(tmpdir(), `vibyra-fake-${name}-`));
  if (process.platform === "win32") {
    await writeFile(join(bin, `${name}-impl.mjs`), script);
    await writeFile(join(bin, `${name}.cmd`), `@echo off\r\nnode "%~dp0${name}-impl.mjs" %*\r\n`);
  } else {
    const path = join(bin, name);
    await writeFile(path, `#!/usr/bin/env node\n${script}`);
    await chmod(path, 0o755);
  }
  return { bin, cleanup: () => rm(bin, { force: true, maxRetries: 20, recursive: true, retryDelay: 100 }) };
}

export function makeFakeNpm() {
  return makeFakeCommand("npm", [
    "import { createServer } from 'node:http';",
    "const portArgIndex = process.argv.lastIndexOf('--port');",
    "const argPort = portArgIndex >= 0 ? Number(process.argv[portArgIndex + 1]) : 0;",
    "const html = process.env.VIBYRA_FAKE_PREVIEW_HTML || process.env.VIBYRA_FAKE_VITE_HTML;",
    "const port = Number(process.env.VIBYRA_FAKE_PREVIEW_PORT || process.env.VIBYRA_FAKE_VITE_PORT || process.env.PORT || argPort);",
    "const delay = Number(process.env.VIBYRA_FAKE_VITE_DELAY_MS || 0);",
    "if (process.env.VIBYRA_FAKE_VITE_FAILURE) {",
    "  console.error(process.env.VIBYRA_FAKE_VITE_FAILURE);",
    "  process.exit(1);",
    "}",
    "const server = createServer((req, res) => {",
    "  if (req.url.includes('AppEntry.bundle')) {",
    "    res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8' });",
    "    res.end('globalThis.__expo_preview_ready__ = true;');",
    "    return;",
    "  }",
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
}

export function makeFakePhp() {
  return makeFakeCommand("php", [
    "import { createServer } from 'node:http';",
    "const portArgIndex = process.argv.lastIndexOf('--port');",
    "const port = Number(process.env.VIBYRA_FAKE_LARAVEL_PORT || process.argv[portArgIndex + 1]);",
    "const html = process.env.VIBYRA_FAKE_LARAVEL_HTML || '<!doctype html><html><body>Laravel</body></html>';",
    "const fallbackOk = !process.env.VIBYRA_FAKE_LARAVEL_REQUIRE_SQLITE_FALLBACK || (process.env.DB_CONNECTION === 'sqlite' && /database[\\\\/]database\\.sqlite$/.test(process.env.DB_DATABASE || '') && process.env.SESSION_DRIVER === 'file');",
    "const status = Number(process.env.VIBYRA_FAKE_LARAVEL_STATUS || (fallbackOk ? 200 : 500));",
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
}

export function killTrackedPreview(projectId) {
  const tracked = appState.previewServers[projectId];
  for (const child of [tracked?.process, ...(tracked?.processes ?? [])]) {
    if (child) killCommandTree(child);
  }
  delete appState.previewServers[projectId];
}

export async function findFreePort() {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  await new Promise((resolve) => server.close(resolve));
  return typeof address === "object" && address ? address.port : 5173;
}

export async function occupyPort() {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, "0.0.0.0", resolve));
  const address = server.address();
  return {
    port: typeof address === "object" && address ? address.port : 0,
    close: () => new Promise((resolve) => server.close(resolve))
  };
}

export async function requestPreview(project, path = "", { cacheProject = true, host = "vibyra.test" } = {}) {
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

export async function requestPreviewServerProxy(project, path = "", host = "vibyra.test", reqOptions = {}) {
  const { token = TOKEN, ...requestOptions } = reqOptions;
  const url = new URL(`${previewServerProxyUrl(project.id, token)}${path}`, `http://${host}`);
  return await requestPreviewRoute(url, servePreviewServerProxy, requestOptions);
}

export async function requestPreviewUrlProxy(target, host = "vibyra.test") {
  const url = new URL(`/preview/proxy-url/${encodeURIComponent(TOKEN)}/?url=${encodeURIComponent(target)}`, `http://${host}`);
  return await requestPreviewRoute(url, servePreviewUrlProxy);
}

export async function requestPreviewProxyPath(path, host = "vibyra.test") {
  return await requestPreviewRoute(new URL(path, `http://${host}`), servePreviewUrlProxy);
}

export async function requestPreviewRefererAsset(path, referer, host = "vibyra.test", reqOptions = {}) {
  const response = await requestPreviewRoute(new URL(path, `http://${host}`), (reqOrRes, resOrUrl, maybeUrl) => (
    maybeUrl
      ? servePreviewRefererAsset(reqOrRes, resOrUrl, maybeUrl, referer)
      : servePreviewRefererAsset(reqOrRes, resOrUrl, referer)
  ), reqOptions);
  return { ...response, served: response.status !== 0 };
}

export async function requestPreviewRoute(url, handler, reqOptions = {}) {
  const response = { status: 0, headers: {}, body: "" };
  const res = {
    headersSent: false,
    writeHead(status, headers) {
      response.status = status;
      response.headers = headers;
      this.headersSent = true;
    },
    write(body) {
      response.body += Buffer.isBuffer(body) ? body.toString("utf8") : String(body ?? "");
      return true;
    },
    end(body) {
      response.body += Buffer.isBuffer(body) ? body.toString("utf8") : String(body ?? "");
    },
    destroy(error) {
      response.error = error;
    }
  };
  if (reqOptions.method || reqOptions.headers || reqOptions.body !== undefined) {
    const req = Readable.from(reqOptions.body !== undefined ? [Buffer.from(String(reqOptions.body))] : []);
    req.method = reqOptions.method ?? "GET";
    req.headers = { host: url.host, ...(reqOptions.headers ?? {}) };
    await handler(req, res, url);
    return response;
  }
  await handler(res, url);
  return response;
}

export function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function proxyPathFor(body, encodedPath) {
  const match = body.match(new RegExp(`(/preview/proxy-url/[^"'\\s)]+${escapeRegExp(encodedPath)}[^"'\\s)]*)`));
  assert.ok(match?.[1], `Expected proxy URL for ${encodedPath}`);
  return match[1];
}
