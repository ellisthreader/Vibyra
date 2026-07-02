import { killCommandTree } from "./commandSpawn.mjs";
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

const pendingStarts = new Map();
const startGenerations = new Map();

export function runPreviewServerStart(projectId, targetId, factory) {
  const key = startKey(projectId, targetId);
  const existing = pendingStarts.get(key);
  if (existing) return existing.promise;
  const generation = (startGenerations.get(key) ?? 0) + 1;
  startGenerations.set(key, generation);
  const promise = Promise.resolve()
    .then(() => factory(generation))
    .finally(() => {
      if (pendingStarts.get(key)?.generation === generation) pendingStarts.delete(key);
    });
  pendingStarts.set(key, { generation, promise });
  return promise;
}

export function cancelPreviewServerStart(projectId, targetId) {
  const key = startKey(projectId, targetId);
  startGenerations.set(key, (startGenerations.get(key) ?? 0) + 1);
  pendingStarts.delete(key);
}

export function isCurrentPreviewServerStart(projectId, targetId, generation, tracked, trackedTargetId = targetId) {
  return startGenerations.get(startKey(projectId, targetId)) === generation
    && previewService(projectId, trackedTargetId) === tracked;
}

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
      else killCommandTree(child);
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

function startKey(projectId, targetId) {
  return `${String(projectId || "")}\n${String(targetId || "")}`;
}
