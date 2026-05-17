import { spawn } from "node:child_process";
import { access, readFile } from "node:fs/promises";
import { join } from "node:path";
import { portsFromOutput, publicDevServerBases } from "./previewDevServerOutput.mjs";
import { choosePreviewPort } from "./previewPortAllocator.mjs";
import { npmRunArgs, npmRunEnv, previewCommand } from "./previewFrameworkProfiles.mjs";
import { stopTrackedPreviewServer, trackPreviewServer } from "./previewServerProcesses.mjs";
import { appState, publicHostFromRequestHost } from "./state.mjs";

const LARAVEL_PORTS = [8000, 8001, 8002, 8003, 8004, 8005, 8080, 8888];

export async function isLaravelViteProject(projectPath, packageText, profile) {
  if (!profile?.laravelBackend || !/laravel-vite-plugin/i.test(String(packageText ?? ""))) return false;
  if (!await fileExists(join(projectPath, "artisan"))) return false;
  const composerText = await readOptionalText(join(projectPath, "composer.json"));
  return /laravel\/framework/i.test(String(composerText ?? ""));
}

export async function startLaravelViteDevServer(project, requestHost, context, options = {}) {
  stopTrackedPreviewServer(project.id);
  const vitePort = options.port ?? await choosePreviewPort(context.packageText, context.profile);
  const laravelPort = options.laravelPort ?? await choosePreviewPort("", { defaultPorts: LARAVEL_PORTS });
  const npmExecutable = process.platform === "win32" ? "npm.cmd" : "npm";
  const php = spawn("php", ["artisan", "serve", "--host", "0.0.0.0", "--port", String(laravelPort)], {
    cwd: project.path,
    detached: process.platform !== "win32",
    env: { ...process.env, ...(options.env ?? {}) },
    stdio: ["ignore", "pipe", "pipe"]
  });
  const npm = spawn(npmExecutable, npmRunArgs(context.profile, vitePort), {
    cwd: project.path,
    detached: process.platform !== "win32",
    env: { ...process.env, BROWSER: "none", FORCE_COLOR: "0", ...npmRunEnv(context.profile, vitePort), ...(options.env ?? {}) },
    stdio: ["ignore", "pipe", "pipe"]
  });
  let output = "";
  const capture = (chunk) => {
    output = `${output}${String(chunk)}`.slice(-5000);
  };
  for (const child of [php, npm]) {
    child.stdout?.on("data", capture);
    child.stderr?.on("data", capture);
    child.on("error", (error) => capture(`${error.message}\n`));
  }

  const command = `php artisan serve --host 0.0.0.0 --port ${laravelPort} + ${previewCommand(context.profile, vitePort)}`;
  trackPreviewServer(project.id, { command, process: php, processes: [php, npm], startedAt: new Date().toISOString() });

  const ready = await waitForLaravelVite(project, requestHost, laravelPort, vitePort, () => output, options.timeoutMs ?? 30000);
  if (ready.url) {
    const tracked = appState.previewServers[project.id];
    if (tracked) {
      tracked.url = ready.url;
      tracked.proxyTargetUrl = `http://127.0.0.1:${laravelPort}`;
      tracked.viteProxyTargetUrl = `http://127.0.0.1:${vitePort}`;
    }
    return { command, started: true, url: ready.url };
  }

  stopTrackedPreviewServer(project.id);
  const reason = ready.failure ? ` ${ready.failure}` : output.trim() ? ` Last output: ${output.trim().slice(-900)}` : "";
  throw new Error(`Vibyra could not verify the Laravel dev server after starting PHP and Vite.${reason}`);
}

async function waitForLaravelVite(project, requestHost, laravelPort, vitePort, output, timeoutMs) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const [viteReady, localRoot] = await Promise.all([
      viteLooksReady(vitePort, output()),
      fetchProbe(`http://127.0.0.1:${laravelPort}/`, { htmlOnly: true })
    ]);
    if (localRoot && !localRoot.ok) {
      return { failure: `Laravel returned HTTP ${localRoot.status} for /. Check ${project.path}/storage/logs/laravel.log for the application error.` };
    }
    if (viteReady && localRoot?.body) {
      const publicBase = publicLaravelBase(laravelPort, requestHost);
      if (isLoopbackHost(publicBase)) return { url: publicBase };
      const publicRoot = await fetchProbe(`${publicBase}/`, { htmlOnly: true });
      if (publicRoot && !publicRoot.ok) {
        return { failure: `Laravel returned HTTP ${publicRoot.status} for ${publicBase}/. Check ${project.path}/storage/logs/laravel.log for the application error.` };
      }
      if (publicRoot?.body) return { url: publicBase };
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return {};
}

async function viteLooksReady(launchPort, output) {
  const ports = Array.from(new Set([launchPort, ...portsFromOutput(output)]));
  for (const port of ports) {
    for (const base of publicDevServerBases(port, "127.0.0.1", output, `http://127.0.0.1:${port}`)) {
      const client = await fetchText(`${base}/@vite/client`, { jsOnly: true });
      if (client && /vite/i.test(client)) return true;
    }
  }
  return false;
}

function publicLaravelBase(port, requestHost) {
  return `http://${publicHostFromRequestHost(requestHost)}:${port}`;
}

function isLoopbackHost(baseUrl) {
  try {
    const host = new URL(baseUrl).hostname;
    return host === "127.0.0.1" || host === "localhost" || host === "::1";
  } catch {
    return false;
  }
}

async function fileExists(path) {
  try { await access(path); return true; } catch { return false; }
}

async function readOptionalText(path) {
  try { return await readFile(path, "utf8"); } catch { return null; }
}

async function fetchText(url, options = {}, timeoutMs = 1200) {
  const probe = await fetchProbe(url, options, timeoutMs);
  return probe?.body ?? null;
}

async function fetchProbe(url, options = {}, timeoutMs = 1200) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
    const contentType = response.headers.get("content-type") ?? "";
    if (options.htmlOnly && contentType && !/text\/html/i.test(contentType)) return null;
    if (options.jsOnly && contentType && !/application\/javascript|text\/javascript/i.test(contentType)) return null;
    if (!response.ok) return { body: "", ok: false, status: response.status };
    return { body: await response.text(), ok: true, status: response.status };
  } catch {
    return null;
  }
}
