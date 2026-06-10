import { readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { join } from "node:path";
import { isViteOutputUrl, portsFromOutput, publicDevServerBases } from "./previewDevServerOutput.mjs";
import { choosePreviewPort } from "./previewPortAllocator.mjs";
import { isLaravelViteProject, startLaravelViteDevServer } from "./previewLaravelDevServer.mjs";
import { previewUnavailableReason } from "./previewDetection.mjs";
import { devServerPortsFromPackage, npmRunArgs, npmRunEnv, previewCommand, previewFrameworkProfile } from "./previewFrameworkProfiles.mjs";
import { existingProjectAppRoots, WEB_APP_DIRECTORIES } from "./projectAppRoots.mjs";
import { expoHtmlMatchesProject, expoPreviewProfile, expoProjectTitles } from "./previewExpo.mjs";
import { runtimePreviewContext, runtimePreviewLaunch } from "./previewRuntimeAdapters.mjs";
import { isSourceOnlyPreviewHtml } from "./previewResolver.mjs";
import { stopTrackedPreviewServer, trackPreviewServer } from "./previewServerProcesses.mjs";
import { activatePreviewService, previewService } from "./previewServices.mjs";
import { appState, publicHostFromRequestHost } from "./state.mjs";

export const PREVIEW_DEV_COMMAND = "npm run dev -- --host 0.0.0.0";

export async function runningProjectDevServerUrl(project, requestHost, appDirectory = "", targetId = "") {
  const context = await sourcePreviewContext(project, appDirectory);
  if (!context) return null;
  const tracked = targetId ? previewService(project.id, targetId) : appState.previewServers[project.id];
  const trackedUrl = tracked?.appDirectory === context.appDirectory ? tracked.url : "";
  if (trackedUrl && await profileServerLooksReady(trackedUrl, context.profile)) return trackedUrl;
  if (context.reuseExisting === false) {
    return null;
  }

  for (const port of devServerPortsFromPackage(context.packageText, context.profile)) {
    const probe = await probeLoopbackPort(port);
    if (!probe) continue;
    const { localBase, localRoot } = probe;
    if (!rootMatchesExistingProject(localRoot, context)) continue;
    if (!await profileServerLooksReady(localBase, context.profile)) continue;

    const publicBase = publicDevServerBase(port, requestHost);
    if (!publicBase) continue;
    if (isLoopbackHost(publicBase)) return publicBase;

    const publicRoot = await fetchText(`${publicBase}/`);
    if (publicRoot && rootMatchesExistingProject(publicRoot, context) && await profileServerLooksReady(publicBase, context.profile, publicRoot)) return publicBase;
  }

  return null;
}

export async function startProjectDevServer(project, requestHost, options = {}) {
  const appDirectory = String(options.appDirectory || "");
  const targetId = String(options.targetId || "");
  const existingUrl = options.reuseExisting ? await runningProjectDevServerUrl(project, requestHost, appDirectory, targetId) : null;
  if (existingUrl) {
    const launch = await projectPreviewLaunch(project, appDirectory);
    const command = launch.command || PREVIEW_DEV_COMMAND;
    const tracked = targetId ? previewService(project.id, targetId) : appState.previewServers[project.id];
    if (tracked?.appDirectory === appDirectory) {
      tracked.url = existingUrl;
      tracked.proxyTargetUrl = loopbackBaseForUrl(existingUrl);
      tracked.command = command;
      tracked.state = "running";
      if (options.activate !== false && targetId) activatePreviewService(project.id, targetId);
    } else {
      trackPreviewServer(project.id, targetId, { appDirectory, command, proxyTargetUrl: loopbackBaseForUrl(existingUrl), startedAt: new Date().toISOString(), state: "running", url: existingUrl }, { activate: options.activate });
    }
    options.onOutput?.(`Verified existing ${launch.framework || "project"} preview at ${existingUrl}\n`);
    return { command, framework: launch.framework || "", profileId: launch.profileId || "", started: false, url: existingUrl };
  }

  const context = await startablePreviewContext(project, appDirectory);
  if (!context) throw new Error(await previewUnavailableReason(project));

  const launchProject = context.appPath === project.path ? project : { ...project, path: context.appPath };
  if (await isLaravelViteProject(context.appPath, context.packageText, context.profile)) {
    return startLaravelViteDevServer(launchProject, requestHost, context, options);
  }

  stopTrackedPreviewServer(project.id, targetId);
  context.launchPort = options.port ?? await choosePreviewPort(context.packageText, context.profile);
  context.targetId = targetId;
  context.preexistingPorts = await occupiedScanPorts(context);
  const runtimeLaunch = context.runtime ? runtimePreviewLaunch(context, context.launchPort) : null;
  context.command = runtimeLaunch?.command || previewCommand(context.profile, context.launchPort);
  const executable = runtimeLaunch?.executable || (process.platform === "win32" ? "npm.cmd" : "npm");
  const args = runtimeLaunch?.args || npmRunArgs(context.profile, context.launchPort);
  const child = spawn(executable, args, {
    cwd: context.appPath,
    detached: process.platform !== "win32",
    env: { ...process.env, BROWSER: "none", FORCE_COLOR: "0", ...npmRunEnv(context.profile, context.launchPort), ...(runtimeLaunch?.env || {}), ...(options.env ?? {}) },
    stdio: ["ignore", "pipe", "pipe"]
  });
  let output = "";
  let launchFailure = null;
  const capture = (chunk) => {
    output = `${output}${String(chunk)}`.slice(-4000);
    options.onOutput?.(chunk);
  };
  child.stdout?.on("data", capture);
  child.stderr?.on("data", capture);
  child.on("error", (error) => { launchFailure = error; capture(error.message); });
  const tracked = trackPreviewServer(project.id, targetId, {
    appDirectory: context.appDirectory,
    command: context.command,
    process: child,
    startedAt: new Date().toISOString()
  }, { activate: options.activate });

  const url = await waitForProjectDevServer(project, requestHost, context, () => output, options.timeoutMs ?? 30000, () => launchFailure || child.exitCode !== null);
  if (url) {
    tracked.url = url;
    tracked.proxyTargetUrl = loopbackBaseForUrl(url);
    tracked.state = "running";
    return { command: context.command, framework: context.profile.label, profileId: context.profile.id, started: true, url };
  }

  stopTrackedPreviewServer(project.id, targetId);
  const reason = output.trim() ? ` Last output: ${output.trim().slice(-900)}` : "";
  throw new Error(`Vibyra could not verify the dev server after starting it.${reason}`);
}

export async function projectPreviewLaunch(project, appDirectory = "") {
  const context = await startablePreviewContext(project, appDirectory);
  if (!context) return { available: false, reason: await previewUnavailableReason(project) };
  return {
    available: true,
    appDirectory: context.appDirectory,
    command: context.profile.command,
    framework: context.profile.label,
    profileId: context.profile.id
  };
}

async function waitForProjectDevServer(project, requestHost, context, output, timeoutMs, stopped = () => false) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const url = await launchedDevServerUrl(context, requestHost, output())
      ?? (context.localScripts.length > 0 ? await runningProjectDevServerUrl(project, requestHost, context.appDirectory, context.targetId) : null);
    if (url) return url;
    if (stopped()) return null;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return null;
}

async function launchedDevServerUrl(context, requestHost, output) {
  const scanPorts = context.profile.scanDefaultPorts
    ? devServerPortsFromPackage(context.packageText, context.profile)
    : [];
  const ports = uniquePorts([context.launchPort, ...portsFromOutput(output), ...scanPorts])
    .filter((port) => !context.preexistingPorts?.has(port));
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

async function sourcePreviewContext(project, appDirectory = "") {
  for (const root of await previewAppRoots(project.path, appDirectory)) {
    const packageText = await readOptionalText(join(root.path, "package.json"));
    const profile = previewProfile(packageText);
    if (!profile) continue;
    const localHtml = await readProjectIndex(root.path);
    if (profile.id === "expo-web") {
      const appText = await readOptionalText(join(root.path, "app.json"));
      return { appDirectory: root.directory, appPath: root.path, expoTitles: expoProjectTitles(appText, packageText), localHtml: "", localScripts: [], packageText, profile };
    }
    if (!localHtml || !isSourceOnlyPreviewHtml(localHtml)) continue;
    const localScripts = sourceScriptPaths(localHtml);
    if (localScripts.length === 0) continue;
    if (profile.viteClient && !looksLikeViteProject(packageText, localHtml)) continue;
    return { appDirectory: root.directory, appPath: root.path, localHtml, localScripts, packageText, profile, reuseExisting: profile.reuseExisting };
  }
  return runtimePreviewContext(project.path, appDirectory);
}

async function startablePreviewContext(project, appDirectory = "") {
  for (const root of await previewAppRoots(project.path, appDirectory)) {
    const packageText = await readOptionalText(join(root.path, "package.json"));
    const profile = previewProfile(packageText);
    if (!profile) continue;
    const localHtml = await readProjectIndex(root.path);
    const localScripts = localHtml && isSourceOnlyPreviewHtml(localHtml) ? sourceScriptPaths(localHtml) : [];
    return { appDirectory: root.directory, appPath: root.path, localHtml, localScripts, packageText, profile, reuseExisting: profile.reuseExisting };
  }
  return runtimePreviewContext(project.path, appDirectory);
}

function previewAppRoots(projectPath, appDirectory = "") {
  if (appDirectory) {
    return existingProjectAppRoots(projectPath, [appDirectory], ["package.json"]);
  }
  return existingProjectAppRoots(projectPath, WEB_APP_DIRECTORIES, ["package.json"]);
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
  if (profile?.id === "expo-web" && !await expoBundleLooksReady(baseUrl, html)) return false;
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

async function expoBundleLooksReady(baseUrl, html) {
  const src = html.match(/<script[^>]+src=["']([^"']*AppEntry\.bundle[^"']*)["']/i)?.[1];
  if (!src) return false;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    const response = await fetch(new URL(src.replace(/&amp;/g, "&"), `${baseUrl}/`), { signal: controller.signal });
    clearTimeout(timeout);
    const ready = response.ok && /(?:application|text)\/javascript/i.test(response.headers.get("content-type") || "");
    await response.body?.cancel();
    return ready;
  } catch {
    return false;
  }
}

function previewProfile(packageText) {
  return expoPreviewProfile(packageText) || previewFrameworkProfile(packageText);
}

function rootMatchesExistingProject(html, context) {
  if (context.profile?.id === "expo-web") return expoHtmlMatchesProject(html, context.expoTitles);
  return rootMatchesProject(html, context.localScripts);
}

async function occupiedScanPorts(context) {
  const occupied = new Set();
  if (!context.profile.scanDefaultPorts) return occupied;
  for (const port of devServerPortsFromPackage(context.packageText, context.profile)) {
    if (await probeLoopbackPort(port)) occupied.add(port);
  }
  return occupied;
}

async function probeLoopbackPort(port) {
  for (const host of ["127.0.0.1", "localhost"]) {
    const localBase = `http://${host}:${port}`;
    const localRoot = await fetchText(`${localBase}/`);
    if (localRoot) return { localBase, localRoot };
  }
  return null;
}
