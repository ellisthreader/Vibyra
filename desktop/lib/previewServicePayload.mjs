import { previewServerProxyUrl } from "./previewUrls.mjs";
import { previewStartupFeed } from "./previewStartupFeed.mjs";
import { previewServicesForProject } from "./previewServices.mjs";
import { appState } from "./state.mjs";

export function previewRuntimePayload(projectId, targets, credential) {
  const active = appState.previewServers[projectId];
  const services = previewServicesForProject(projectId).map((service) => (
    servicePayload(projectId, service, active, credential)
  ));
  const byTarget = new Map(services.map((service) => [service.targetId, service]));
  return {
    activeTargetId: active?.targetId || null,
    services,
    targets: targets.map((target) => ({
      ...target,
      runtime: byTarget.get(target.id) || stoppedTargetRuntime(projectId, target.id)
    }))
  };
}

function servicePayload(projectId, service, active, credential) {
  const isActive = active === service;
  return {
    targetId: service.targetId,
    state: service.state === "starting" ? "starting" : service.url ? "running" : "starting",
    active: isActive,
    command: service.command || "",
    url: isActive && service.url ? previewServerProxyUrl(projectId, credential) : null,
    startedAt: service.startedAt || null
  };
}

function stoppedTargetRuntime(projectId, targetId) {
  const startup = previewStartupFeed(projectId, targetId);
  return {
    targetId,
    state: startup?.state === "starting" ? "starting" : "stopped",
    active: false,
    command: startup?.command || "",
    url: null,
    startedAt: null
  };
}
