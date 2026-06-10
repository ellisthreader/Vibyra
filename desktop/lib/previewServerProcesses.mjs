import { appState } from "./state.mjs";
import {
  activatePreviewService,
  allPreviewServices,
  previewService,
  previewServiceTargetId,
  reconcileActivePreviewService,
  removePreviewService,
  storePreviewService
} from "./previewServices.mjs";

export function trackPreviewServer(projectId, targetIdOrTracked, maybeTracked, options = {}) {
  const explicitTarget = typeof targetIdOrTracked === "string";
  const tracked = explicitTarget ? maybeTracked : targetIdOrTracked;
  const targetId = explicitTarget
    ? String(targetIdOrTracked || "") || legacyTargetId(tracked)
    : tracked?.targetId || legacyTargetId(tracked);
  stopTrackedPreviewServer(projectId, targetId);
  tracked.targetId = targetId;
  tracked.state ||= "starting";
  storePreviewService(projectId, targetId, tracked);
  if (options.activate !== false) activatePreviewService(projectId, targetId);
  for (const child of trackedPreviewProcesses(tracked)) {
    child.on("exit", () => stopTrackedPreviewServer(projectId, targetId, tracked));
  }
  return tracked;
}

export function stopTrackedPreviewServer(projectId, targetId = "", expected = null) {
  const active = appState.previewServers[projectId];
  const resolvedTargetId = String(targetId || previewServiceTargetId(projectId, active) || "");
  const tracked = resolvedTargetId ? previewService(projectId, resolvedTargetId) : active;
  if (expected && tracked !== expected) return false;
  if (!tracked) return;
  if (resolvedTargetId) removePreviewService(projectId, resolvedTargetId, tracked);
  if (appState.previewServers[projectId] === tracked) reconcileActivePreviewService(projectId, tracked);
  for (const child of trackedPreviewProcesses(tracked)) {
    try {
      if (process.platform !== "win32" && child.pid) process.kill(-child.pid);
      else child.kill();
    } catch {
      try { child.kill(); } catch {}
    }
  }
  return true;
}

export function trackedPreviewProcesses(tracked) {
  return Array.from(new Set([tracked?.process, ...(tracked?.processes ?? [])].filter(Boolean)));
}

export function stopAllTrackedPreviewServers() {
  const services = allPreviewServices();
  for (const { projectId, service } of services) {
    stopTrackedPreviewServer(projectId, previewServiceTargetId(projectId, service), service);
  }
}

function legacyTargetId(tracked) {
  return `legacy:${String(tracked?.appDirectory || "active")}`;
}
