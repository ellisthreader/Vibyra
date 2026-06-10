import { projectById, discoverProjects } from "./projects.mjs";
import { resolvedPreviewUrl } from "./preview.mjs";
import { startProjectDevServer } from "./previewDevServer.mjs";
import { issuePreviewCapability } from "./previewCapabilities.mjs";
import { previewUnavailableReason } from "./previewDetection.mjs";
import { recommendPreviewViewport } from "./previewRecommendation.mjs";
import { previewServerProxyUrl } from "./previewUrls.mjs";
import { detectPreviewTargets, resolvePreviewTarget } from "./previewTargets.mjs";
import { appendPreviewStartup, beginPreviewStartup, finishPreviewStartup, previewStartupFeed } from "./previewStartupFeed.mjs";
import { stopTrackedPreviewServer } from "./previewServerProcesses.mjs";
import { activatePreviewService, previewService } from "./previewServices.mjs";
import { previewRuntimePayload } from "./previewServicePayload.mjs";
import { appState, event, pushEvents } from "./state.mjs";

const pendingStarts = new Map();

export async function openDesktopPreview(body, requestHost) {
  const project = await desktopPreviewProject(body?.projectId);
  const activeTargetId = appState.previewServers[project.id]?.targetId || "";
  const credential = issuePreviewCapability(project.id, { targetId: activeTargetId });
  const trackedUrl = appState.previewServers[project.id]?.url || "";
  const [resolvedUrl, recommendation, targets] = await Promise.all([
    trackedUrl || resolvedPreviewUrl(project, requestHost, credential),
    recommendPreviewViewport(project),
    detectPreviewTargets(project)
  ]);
  const launch = targets.find((target) => target.available) || {
    available: false,
    reason: await previewUnavailableReason(project)
  };
  const url = proxiedDesktopPreviewUrl(project, resolvedUrl, credential);
  const runtime = previewRuntimePayload(project.id, targets, credential);
  appState.latestPreviewCredential = credential;
  appState.latestPreview = {
    state: url ? "live" : "unavailable",
    url,
    title: project.name,
    message: url ? "Live preview opened from Vibyra Desktop" : launch.available ? `${launch.framework} is ready to run.` : launch.reason,
    launch,
    targets: runtime.targets,
    services: runtime.services,
    activeTargetId: runtime.activeTargetId,
    recommendation,
    capturedAt: new Date().toISOString()
  };
  const log = event("Preview", url ? `Live preview opened for ${project.name}` : `No runnable preview found for ${project.name}`, url ? "success" : "warning");
  pushEvents([log]);
  return { ok: true, events: [log], preview: appState.latestPreview };
}

export async function startDesktopPreviewServer(body, requestHost) {
  const project = await desktopPreviewProject(body?.projectId);
  const target = await resolvePreviewTarget(project, body?.targetId);
  if (!target?.available) {
    const error = new Error("Choose an available detected app before running Preview.");
    error.status = 422;
    throw error;
  }
  const result = await startTargetService(project, target, requestHost);
  activatePreviewService(project.id, target.id);
  const credential = issuePreviewCapability(project.id, { targetId: target.id });
  const url = previewServerProxyUrl(project.id, credential);
  const recommendation = await recommendPreviewViewport(project);
  const targets = await detectPreviewTargets(project);
  const runtime = previewRuntimePayload(project.id, targets, credential);
  appState.latestPreviewCredential = credential;
  appState.latestPreview = {
    state: "live",
    url,
    title: project.name,
    message: result.started ? "Desktop preview server started" : "Desktop preview server is already running",
    target,
    targets: runtime.targets,
    services: runtime.services,
    activeTargetId: runtime.activeTargetId,
    recommendation,
    capturedAt: new Date().toISOString()
  };
  const log = event("Preview", `${result.started ? "Started" : "Found"} live preview for ${project.name}`, "success");
  pushEvents([log]);
  return { ok: true, command: result.command, events: [log], preview: appState.latestPreview };
}

export async function activateDesktopPreviewServer(body) {
  const project = await desktopPreviewProject(body?.projectId);
  const targetId = requiredTargetId(body?.targetId);
  const service = previewService(project.id, targetId);
  if (!service?.url) throw previewServiceError("That preview target is not running.", 409);
  activatePreviewService(project.id, targetId);
  const credential = issuePreviewCapability(project.id, { targetId });
  return previewServiceResponse(project, credential, "Preview target activated");
}

export async function stopDesktopPreviewServer(body) {
  const project = await desktopPreviewProject(body?.projectId);
  const targetId = requiredTargetId(body?.targetId);
  if (!previewService(project.id, targetId)) throw previewServiceError("That preview target is not running.", 404);
  stopTrackedPreviewServer(project.id, targetId);
  const activeTargetId = appState.previewServers[project.id]?.targetId || "";
  const credential = issuePreviewCapability(project.id, { targetId: activeTargetId });
  return previewServiceResponse(project, credential, "Preview target stopped");
}

export function desktopPreviewStartup(projectId, targetId) {
  const feed = previewStartupFeed(projectId, targetId);
  return feed ? { ok: true, startup: feed } : { ok: true, startup: null };
}

function proxiedDesktopPreviewUrl(project, url, credential) {
  if (!url || !/^https?:\/\//i.test(url)) return url;
  const running = appState.previewServers[project.id];
  if (!running?.url) return null;
  return previewServerProxyUrl(project.id, credential);
}

async function desktopPreviewProject(value) {
  const projectId = String(value || appState.selectedProjectId || "").trim();
  if (!projectId) {
    const error = new Error("Choose a desktop project before opening a preview.");
    error.status = 422;
    throw error;
  }
  let project = projectById(projectId);
  if (!project) {
    await discoverProjects();
    project = projectById(projectId);
  }
  if (project) return project;
  const error = new Error("That desktop project is no longer available.");
  error.status = 404;
  throw error;
}

async function startTargetService(project, target, requestHost) {
  const key = `${project.id}\n${target.id}`;
  if (!pendingStarts.has(key)) {
    const pending = (async () => {
      beginPreviewStartup(project.id, target);
      try {
        const result = await startProjectDevServer(project, requestHost, {
          activate: false,
          appDirectory: target.appDirectory,
          onOutput: (chunk) => appendPreviewStartup(project.id, target.id, chunk),
          reuseExisting: true,
          targetId: target.id,
          timeoutMs: 80000
        });
        finishPreviewStartup(project.id, target.id, "live", result.started ? "Preview is live." : "Using the verified running preview.");
        return result;
      } catch (error) {
        finishPreviewStartup(project.id, target.id, "error", error instanceof Error ? error.message : "Preview failed to start.");
        throw error;
      } finally {
        pendingStarts.delete(key);
      }
    })();
    pendingStarts.set(key, pending);
  }
  return pendingStarts.get(key);
}

async function previewServiceResponse(project, credential, message) {
  const targets = await detectPreviewTargets(project);
  const runtime = previewRuntimePayload(project.id, targets, credential);
  const active = appState.previewServers[project.id];
  const preview = {
    state: active?.url ? "live" : "unavailable",
    url: active?.url ? previewServerProxyUrl(project.id, credential) : null,
    title: project.name,
    message,
    targets: runtime.targets,
    services: runtime.services,
    activeTargetId: runtime.activeTargetId,
    capturedAt: new Date().toISOString()
  };
  appState.latestPreviewCredential = credential;
  appState.latestPreview = preview;
  return {
    ok: true,
    preview
  };
}

function requiredTargetId(value) {
  const targetId = String(value || "").trim();
  if (targetId) return targetId;
  throw previewServiceError("Choose a preview target.", 422);
}

function previewServiceError(message, status) {
  const error = new Error(message);
  error.status = status;
  return error;
}
