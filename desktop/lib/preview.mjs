import { dirname, isAbsolute } from "node:path";
import { readFile } from "node:fs/promises";
import { headers } from "./http.mjs";
import { appState, TOKEN } from "./state.mjs";
import { discoverProjects, findProjectById } from "./projects.mjs";
import { isDirectory, projectFromPath } from "./projectInfo.mjs";
import { projectPreviewLaunch, runningProjectDevServerUrl } from "./previewDevServer.mjs";
import { previewServerProxyUrl, previewUrl } from "./previewUrls.mjs";
import { previewCredentialAllowsProject, previewCredentialTargetId } from "./previewCapabilities.mjs";
import { previewService } from "./previewServices.mjs";
import { contentTypeFor, isPreviewImagePath, missingPreviewImageSvg, previewEntryPath, previewMountDirectory, rewritePreviewCss, rewritePreviewHtml, safeProjectFile } from "./previewStatic.mjs";
import { proxyPreviewResponse } from "./previewProxyResponse.mjs";
import { canProxyPreviewFallbackPath, laravelPublicAssetTargetForViteProxy, normalizeProxyTargetUrl, previewExternalUrl, previewProxyTargetAllowed, previewReferenceFromReferer, previewTargetFromProject, safeUrl, trackedPreviewTarget } from "./previewProxyReferences.mjs";
import { injectProxyRuntimeErrorOverlay } from "./previewProxyRuntime.mjs";
import { redirect, sendHtml, previewShell } from "./previewUi.mjs";

export { previewServerProxyUrl, previewUrl } from "./previewUrls.mjs";
export async function serveProjectPreview(res, url) {
  const match = url.pathname.match(/^\/preview\/project\/([^/]+)\/([^/]+)\/?(.*)$/);
  const projectId = match ? decodeURIComponent(match[1]) : "";
  const credential = match ? decodeURIComponent(match[2]) : "";
  if (!match || !credentialAllowsProject(credential, projectId)) {
    sendHtml(res, 401, previewShell("Preview link expired", "Reconnect your phone to Vibyra Desktop and open the project again."));
    return;
  }

  if (appState.cachedProjects.length === 0) {
    await discoverProjects();
  }

  const project = await resolvePreviewProject(projectId);
  if (!project) {
    sendHtml(res, 404, previewShell("Project not found", "Vibyra Desktop could not find that workspace anymore."));
    return;
  }

  const requestedPath = decodeURIComponent(match[3] ?? "").replace(/^\/+/, "");
  const entryPath = await previewEntryPath(project);
  const relativePath = requestedPath || entryPath;

  if (!relativePath) {
    if (trackedPreviewTarget(projectId, credential)) {
      redirect(res, previewServerProxyUrl(projectId, credential));
      return;
    }
    const devServerUrl = await runningProjectDevServerUrl(project, url.host);
    if (devServerUrl) {
      redirect(res, devServerUrl);
      return;
    }
    sendHtml(res, 404, previewShell("No runnable preview found", "Vibyra could not find a built browser entry or verified running dev server for this folder."));
    return;
  }

  const filePath = await safeProjectFile(project.path, relativePath);
  if (!filePath) {
    if (trackedPreviewTarget(projectId, credential)) {
      await servePreviewServerProxy(res, new URL(previewServerProxyUrl(projectId, credential) + requestedPath, url));
      return;
    }
    if (isPreviewImagePath(relativePath)) {
      res.writeHead(200, headers("image/svg+xml; charset=utf-8"));
      res.end(missingPreviewImageSvg());
      return;
    }

    sendHtml(res, 404, previewShell("Preview file missing", "The requested preview asset is no longer available."));
    return;
  }

  const contentType = contentTypeFor(filePath);
  let content = await readFile(filePath);
  const mountDirectory = previewMountDirectory(entryPath);

  if (contentType.startsWith("text/html")) {
    const documentDirectory = requestedPath ? dirname(relativePath) : mountDirectory;
    content = Buffer.from(injectProxyRuntimeErrorOverlay(rewritePreviewHtml(content.toString("utf8"), {
      documentDirectory: documentDirectory === "." ? "" : documentDirectory,
      mountDirectory,
      projectId,
      token: credential
    })));
  } else if (contentType.startsWith("text/css")) {
    content = Buffer.from(rewritePreviewCss(content.toString("utf8"), { mountDirectory, projectId, token: credential }));
  }

  res.writeHead(200, headers(contentType));
  res.end(content);
}

export async function servePreviewServerProxy(reqOrRes, resOrUrl, maybeUrl) {
  const { req, res, url } = routeArgs(reqOrRes, resOrUrl, maybeUrl);
  const match = url.pathname.match(/^\/preview\/server\/([^/]+)\/([^/]+)\/?(.*)$/);
  const projectId = match ? decodeURIComponent(match[1]) : "";
  const credential = match ? decodeURIComponent(match[2]) : "";
  if (!match || !credentialAllowsProject(credential, projectId)) {
    sendHtml(res, 401, previewShell("Preview link expired", "Reconnect your phone to Vibyra Desktop and open the project again."));
    return;
  }

  const targetId = previewCredentialTargetId(credential, { legacyToken: TOKEN });
  const tracked = targetId ? previewService(projectId, targetId) : appState.previewServers[projectId];
  const targetBase = normalizeProxyTargetUrl(safeUrl(tracked?.proxyTargetUrl || tracked?.url));
  if (!targetBase) {
    sendHtml(res, 404, previewShell("Preview server not running", "Start the desktop preview server again from Vibyra."));
    return;
  }

  const requestedPath = normalizePreviewServerRequestedPath(match[3] ?? "", projectId, credential);
  const target = new URL(requestedPath, `${targetBase.toString().replace(/\/+$/, "")}/`);
  target.search = url.search;
  await proxyPreviewResponse(res, target, {
    proxyBase: previewServerProxyUrl(projectId, credential),
    token: credential,
    req
  });
}

export async function servePreviewUrlProxy(reqOrRes, resOrUrl, maybeUrl) {
  const { req, res, url } = routeArgs(reqOrRes, resOrUrl, maybeUrl);
  const match = url.pathname.match(/^\/preview\/proxy-url\/([^/]+)\/?$/);
  const credential = match ? decodeURIComponent(match[1]) : "";
  const target = normalizeProxyTargetUrl(safeUrl(url.searchParams.get("url")));
  if (!match) {
    sendHtml(res, 401, previewShell("Preview link expired", "Reconnect your phone to Vibyra Desktop and open the project again."));
    return;
  }

  if (!target || !["http:", "https:"].includes(target.protocol)) {
    sendHtml(res, 400, previewShell("Preview asset unavailable", "Vibyra could not resolve that preview asset."));
    return;
  }

  if (!previewProxyTargetAllowed(target, credential)) {
    sendHtml(res, 401, previewShell("Preview link expired", "Reconnect your phone to Vibyra Desktop and open the project again."));
    return;
  }

  const proxyTarget = laravelPublicAssetTargetForViteProxy(target, credential) ?? target;
  await proxyPreviewResponse(res, proxyTarget, {
    externalProxy: true,
    proxyBase: previewExternalUrl(proxyTarget, credential),
    token: credential,
    req
  });
}

export async function servePreviewRefererAsset(reqOrRes, resOrUrl, urlOrReferer, maybeReferer) {
  const req = maybeReferer === undefined ? null : reqOrRes;
  const res = maybeReferer === undefined ? reqOrRes : resOrUrl;
  const url = maybeReferer === undefined ? resOrUrl : urlOrReferer;
  const referer = maybeReferer === undefined ? urlOrReferer : maybeReferer;
  const previewRef = previewReferenceFromReferer(referer, url);
  if (!previewRef || !canProxyPreviewFallbackPath(url.pathname)) return false;

  const requestedPath = `${url.pathname}${url.search}`;
  const credential = previewRef.token;
  if (!credential) return false;

  if (previewRef.kind === "project") {
    const projectPath = await projectPreviewRefererPath(previewRef.projectId, requestedPath);
    const synthetic = new URL(
      `/preview/project/${encodeURIComponent(previewRef.projectId)}/${encodeURIComponent(credential)}${projectPath}`,
      url
    );
    await serveProjectPreview(res, synthetic);
    return true;
  }

  const target = previewRef.kind === "external"
    ? new URL(requestedPath, previewRef.target)
    : previewTargetFromProject(previewRef.projectId, requestedPath, credential);
  if (!target) return false;

  await proxyPreviewResponse(res, target, {
    externalProxy: previewRef.kind === "external",
    proxyBase: previewRef.kind === "external" ? previewExternalUrl(target, credential) : previewServerProxyUrl(previewRef.projectId, credential),
    token: credential,
    req
  });
  return true;
}

async function projectPreviewRefererPath(projectId, requestedPath) {
  const project = await resolvePreviewProject(projectId);
  const entryPath = project ? await previewEntryPath(project) : "";
  const mountDirectory = previewMountDirectory(entryPath);
  const cleanPath = String(requestedPath || "/").replace(/^\/+/, "");
  if (!mountDirectory || cleanPath.startsWith(`${mountDirectory}/`)) return `/${cleanPath}`;
  return `/${mountDirectory}/${cleanPath}`;
}

async function resolvePreviewProject(projectId) {
  const cached = findProjectById(projectId);
  if (cached) return cached;
  try {
    const path = Buffer.from(String(projectId || ""), "base64url").toString("utf8");
    if (!isAbsolute(path) || !(await isDirectory(path))) return null;
    const project = await projectFromPath(path);
    return project.id === projectId ? project : null;
  } catch {
    return null;
  }
}


function normalizePreviewServerRequestedPath(rawPath, projectId, token) {
  let requestedPath = decodeURIComponent(rawPath ?? "").replace(/^\/+/, "");
  for (let index = 0; index < 4; index += 1) {
    const match = requestedPath.match(/^preview\/server\/([^/]+)\/([^/]+)\/?(.*)$/);
    if (!match || decodeURIComponent(match[1]) !== projectId || decodeURIComponent(match[2]) !== token) break;
    requestedPath = decodeURIComponent(match[3] ?? "").replace(/^\/+/, "");
  }
  return requestedPath;
}

export async function resolvedPreviewUrl(project, requestHost, credential, options = {}) {
  if (!project) return null;
  const runningUrl = await runningProjectDevServerUrl(project, requestHost);
  if (runningUrl) {
    if (!options.phoneVisible) return runningUrl;
    await startProjectDevServer(project, requestHost, { reuseExisting: true });
    return previewServerProxyUrl(project.id, credential);
  }
  const entryPath = await previewEntryPath(project);
  if (!entryPath) return null;
  if (entryPath === "index.html" && (await projectPreviewLaunch(project)).available) return null;
  return previewUrl(project.id, credential);
}

function credentialAllowsProject(credential, projectId) {
  return previewCredentialAllowsProject(credential, projectId, { legacyToken: TOKEN });
}

function routeArgs(reqOrRes, resOrUrl, maybeUrl) {
  if (maybeUrl) return { req: reqOrRes, res: resOrUrl, url: maybeUrl };
  return { req: null, res: reqOrRes, url: resOrUrl };
}
