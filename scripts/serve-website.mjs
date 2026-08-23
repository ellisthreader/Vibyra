import http from "node:http";
import { spawn } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const publicDir = join(repo, "backend", "public");
const router = join(repo, "backend", "vendor", "laravel", "framework", "src",
  "Illuminate", "Foundation", "resources", "server.php");
const port = Number(process.env.VIBYRA_WEBSITE_PORT || 8128);
const upstreamPort = Number(process.env.VIBYRA_WEBSITE_PHP_PORT || port + 1);
let stopping = false;

const php = spawn("php", ["-S", `0.0.0.0:${upstreamPort}`, "-t", ".", router], {
  cwd: publicDir,
  stdio: ["ignore", "inherit", "inherit"],
  windowsHide: true,
});

const server = http.createServer((request, response) => {
  const upstream = http.request({
    hostname: "127.0.0.1",
    port: upstreamPort,
    method: request.method,
    path: request.url,
    headers: request.headers,
  }, (upstreamResponse) => {
    response.writeHead(upstreamResponse.statusCode || 502, upstreamResponse.headers);
    upstreamResponse.pipe(response);
  });
  upstream.on("error", () => {
    if (!response.headersSent) response.writeHead(502, { "Content-Type": "text/plain" });
    response.end("Vibyra is starting. Refresh in a moment.\n");
  });
  request.pipe(upstream);
});

server.keepAliveTimeout = 5_000;
server.headersTimeout = 10_000;
server.listen(port, "127.0.0.1", () => {
  process.stdout.write(`Vibyra website: http://127.0.0.1:${port}\n`);
});

function stop() {
  if (stopping) return;
  stopping = true;
  server.close(() => process.exit(0));
  php.kill();
  setTimeout(() => process.exit(0), 2_000).unref();
}

php.on("exit", (code) => {
  if (!stopping) {
    process.stderr.write(`Vibyra PHP server stopped (${code ?? "unknown"}).\n`);
    server.close(() => process.exit(code || 1));
  }
});
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
