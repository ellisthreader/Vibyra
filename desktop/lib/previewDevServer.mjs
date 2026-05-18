import { readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { join } from "node:path";
import { isViteOutputUrl, portsFromOutput, publicDevServerBases } from "./previewDevServerOutput.mjs";
import { choosePreviewPort } from "./previewPortAllocator.mjs";
import { isLaravelViteProject, startLaravelViteDevServer } from "./previewLaravelDevServer.mjs";
import { devServerPortsFromPackage, npmRunArgs, npmRunEnv, previewCommand, previewFrameworkProfile } from "./previewFrameworkProfiles.mjs";
import { isSourceOnlyPreviewHtml } from "./previewResolver.mjs";
import { stopTrackedPreviewServer, trackPreviewServer } from "./previewServerProcesses.mjs";
import { appState, publicHostFromRequestHost } from "./state.mjs";

export const PREVIEW_DEV_COMMAND = "npm run dev -- --host 0.0.0.0";

export async function runningProjectDevServerUrl(project, requestHost) {
  const context = await sourcePreviewContext(project);
  if (!context) return null;

  for (const port of devServerPortsFromPackage(context.packageText, context.profile)) {
    const probe = await probeLoopbackPort(port);
    if (!probe) continue;
    const { localBase, localRoot } = probe;
    if (!rootMatchesProject(localRoot, context.localScripts)) continue;
    if (!await profileServerLooksReady(localBase, context.profile)) continue;

    const publicBase = publicDevServerBase(port, requestHost);
    if (!publicBase) continue;
    if (isLoopbackHost(publicBase)) return publicBase;

    const publicRoot = await fetchText(`${publicBase}/`);
    if (publicRoot && rootMatchesProject(publicRoot, context.localScripts) && await profileServerLooksReady(publicBase, context.profile, publicRoot)) return publicBase;
  }

  return null;
}

export async function startProjectDevServer(project, requestHost, options = {}) {
  const existingUrl = options.reuseExisting ? await runningProjectDevServerUrl(project, requestHost) : null;
  if (existingUrl) {
    const tracked = appState.previewServers[project.id];
    if (tracked) {
      tracked.url = existingUrl;
      tracked.proxyTargetUrl = loopbackBaseForUrl(existingUrl);
    } else {
      trackPreviewServer(project.id, { command: PREVIEW_DEV_COMMAND, proxyTargetUrl: loopbackBaseForUrl(existingUrl), startedAt: new Date().toISOString(), url: existingUrl });
    }
    return { command: PREVIEW_DEV_COMMAND, started: false, url: existingUrl };
  }

  const context = await startablePreviewContext(project);
  if (!context) throw new Error("This project does not expose a recognized web dev script that Vibyra can start safely. Add a standard package.json script for Vite, SvelteKit, Next.js, Astro, Nuxt, Angular, Vue CLI, Create React App, or Remix Vite, then try Preview again.");

  if (await isLaravelViteProject(project.path, context.packageText, context.profile)) {
    return startLaravelViteDevServer(project, requestHost, context, options);
  }

  stopTrackedPreviewServer(project.id);
  context.launchPort = options.port ?? await choosePreviewPort(context.packageText, context.profile);
  context.command = previewCommand(context.profile, context.launchPort);
  const executable = process.platform === "win32" ? "npm.cmd" : "npm";
  const child = spawn(executable, npmRunArgs(context.profile, context.launchPort), {
    cwd: project.path,
    detached: process.platform !== "win32",
    env: { ...process.env, BROWSER: "none", FORCE_COLOR: "0", ...npmRunEnv(context.profile, context.launchPort), ...(options.env ?? {}) },
    stdio: ["ignore", "pipe", "pipe"]
  });
  let output = "";
  const capture = (chunk) => {
    output = `${output}${String(chunk)}`.slice(-4000);
  };
  child.stdout?.on("data", capture);
  child.stderr?.on("data", capture);
  trackPreviewServer(project.id, { command: context.command, process: child, startedAt: new Date().toISOString() });

  const url = await waitForProjectDevServer(project, requestHost, context, () => output, options.timeoutMs ?? 30000);
  if (url) {
    const tracked = appStatePreviewServer(project.id);
    if (tracked) {
      tracked.url = url;
      tracked.proxyTargetUrl = loopbackBaseForUrl(url);
    }
    return { command: context.command, started: true, url };
  }

  stopTrackedPreviewServer(project.id);
  const reason = output.trim() ? ` Last output: ${output.trim().slice(-900)}` : "";
  throw new Error(`Vibyra could not verify the dev server after starting it.${reason}`);
}

async function waitForProjectDevServer(project, requestHost, context, output, timeoutMs) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const url = await launchedDevServerUrl(context, requestHost, output())
      ?? (context.localScripts.length > 0 ? await runningProjectDevServerUrl(project, requestHost) : null);
    if (url) return url;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return null;
}

async function launchedDevServerUrl(context, requestHost, output) {
  const ports = uniquePorts([context.launchPort, ...portsFromOutput(output)]);
  if (ports.length === 0) return null;
  for (const port of ports) {
    const probe = await probeLoopbackPort(port);
    if (!probe) continue;
    const { localBase, localRoot } = probe;
    if (!/<!doctype\s+html|<html\b|<body\b/i.test(localRoot)) continue;
    if (context.localScripts.length > 0 && !rootMatchesProject(localRoot, context.localScripts)) continue;
    if (!await profileServerLooksReady(localBase, context.profile, localRoot)) continue;

    for (const rawPublicBase of publicDevServerBases(port, requestHost, output, publicDevServerBase(port, requestHost))) {
      const publicBase = normalizePublicDevServerBase(rawPublicBase, requestHost);
      if (isLoopbackHost(publicBase)) return publicBase;
      if (isViteOutputUrl(rawPublicBase, output) && !isBindAllHost(rawPublicBase)) return publicBase;
      const publicRoot = await fetchText(`${publicBase}/`);
      if (publicRoot && await profileServerLooksReady(publicBase, context.profile, publicRoot)) return publicBase;
    }
  }
  return null;
}

function uniquePorts(ports) {
  return Array.from(new Set(ports.filter((port) => Number.isInteger(port) && port > 0 && port < 65536)));
}

async function sourcePreviewContext(project) {
  const localHtml = await readProjectIndex(project.path);
  if (!localHtml || !isSourceOnlyPreviewHtml(localHtml)) return null;
  const localScripts = sourceScriptPaths(localHtml);
  if (localScripts.length === 0) return null;
  const packageText = await readOptionalText(join(project.path, "package.json"));
  const profile = previewFrameworkProfile(packageText);
  if (!profile) return null;
  if (profile.viteClient && !looksLikeViteProject(packageText, localHtml)) return null;
  return { localHtml, localScripts, packageText, profile };
}

async function startablePreviewContext(project) {
  const packageText = await readOptionalText(join(project.path, "package.json"));
  const profile = previewFrameworkProfile(packageText);
  if (!profile) return null;
  const localHtml = await readProjectIndex(project.path);
  const localScripts = localHtml && isSourceOnlyPreviewHtml(localHtml) ? sourceScriptPaths(localHtml) : [];
  return { localHtml, localScripts, packageText, profile };
}

function looksLikeViteProject(packageText, html) {
  return /\bvite\b/i.test(String(packageText ?? "")) || /@vite\/client|vite\/client/i.test(html);
}
function rootMatchesProject(html, localScripts) {
  if (!/<!doctype\s+html|<html\b|<body\b/i.test(html)) return false;
  const remoteScripts = new Set(sourceScriptPaths(html));
  return localScripts.every((script) => remoteScripts.has(script));
}
function sourceScriptPaths(html) {
  const paths = [];
  for (const tag of html.match(/<script\b[^>]*>/gi) ?? []) {
    const src = tag.match(/\bsrc=["']([^"']+)["']/i)?.[1];
    if (!src || /^(?:https?:|\/\/|data:|blob:)/i.test(src)) continue;
    const cleaned = src.replace(/^\.?\//, "").split(/[?#]/)[0];
    if (/^(?:src\/|@vite\/client)/i.test(cleaned)) paths.push(`/${cleaned}`);
  }
  return Array.from(new Set(paths));
}
async function viteClientLooksReady(baseUrl) {
  const client = await fetchText(`${baseUrl}/@vite/client`);
  return Boolean(client && /vite/i.test(client));
}
async function profileServerLooksReady(baseUrl, profile, rootHtml = "") {
  let html = rootHtml;
  if (!/<!doctype\s+html|<html\b|<body\b/i.test(html)) html = await fetchText(`${baseUrl}/`) ?? "";
  if (!/<!doctype\s+html|<html\b|<body\b/i.test(html)) return false;
  if (profile?.markers?.length && !profile.markers.some((marker) => marker.test(html))) return false;
  return !profile?.viteClient || await viteClientLooksReady(baseUrl);
}
function publicDevServerBase(port, requestHost) {
  return `http://${publicHostFromRequestHost(requestHost)}:${port}`;
}

function normalizePublicDevServerBase(baseUrl, requestHost) {
  try {
    const parsed = new URL(baseUrl);
    if (isBindAllHost(parsed.hostname)) parsed.hostname = publicHostFromRequestHost(requestHost);
    return parsed.toString().replace(/\/+$/, "");
  } catch {
    return baseUrl;
  }
}

function loopbackBaseForUrl(url) {
  try {
    const parsed = new URL(url);
    return `${parsed.protocol}//127.0.0.1:${parsed.port}`;
  } catch {
    return url;
  }
}

function appStatePreviewServer(projectId) {
  return appState.previewServers[projectId] ?? null;
}
function isLoopbackHost(baseUrl) {
  try {
    const host = new URL(baseUrl).hostname;
    return host === "127.0.0.1" || host === "localhost" || host === "::1";
  } catch {
    return false;
  }
}

function isBindAllHost(baseUrl) {
  try {
    const host = new URL(baseUrl).hostname;
    return host === "0.0.0.0" || host === "::";
  } catch {
    return false;
  }
}
async function readProjectIndex(projectPath) { return readOptionalText(join(projectPath, "index.html")); }
async function readOptionalText(path) {
  try { return await readFile(path, "utf8"); } catch { return null; }
}

async function fetchText(url, timeoutMs = 3000) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
    if (!response.ok) return null;
    const contentType = response.headers.get("content-type") ?? "";
    if (contentType && !/text\/html|application\/javascript|text\/javascript/i.test(contentType)) return null;
    return await response.text();
  } catch {
    return null;
  }
}

async function probeLoopbackPort(port) {
  for (const host of ["127.0.0.1", "localhost"]) {
    const localBase = `http://${host}:${port}`;
    const localRoot = await fetchText(`${localBase}/`);
    if (localRoot) return { localBase, localRoot };
  }
  return null;
}
