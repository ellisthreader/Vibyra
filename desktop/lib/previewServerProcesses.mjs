import { appState } from "./state.mjs";

export function trackPreviewServer(projectId, tracked) {
  stopTrackedPreviewServer(projectId);
  appState.previewServers[projectId] = tracked;
  for (const child of trackedPreviewProcesses(tracked)) {
    child.on("exit", () => {
      if (appState.previewServers[projectId] === tracked) stopTrackedPreviewServer(projectId);
    });
  }
}

export function stopTrackedPreviewServer(projectId) {
  const tracked = appState.previewServers[projectId];
  if (!tracked) return;
  delete appState.previewServers[projectId];
  for (const child of trackedPreviewProcesses(tracked)) {
    try {
      if (process.platform !== "win32" && child.pid) process.kill(-child.pid);
      else child.kill();
    } catch {
      try { child.kill(); } catch {}
    }
  }
}

export function trackedPreviewProcesses(tracked) {
  return Array.from(new Set([tracked?.process, ...(tracked?.processes ?? [])].filter(Boolean)));
}
