import { appState } from "./state.mjs";

export function previewService(projectId, targetId) {
  return appState.previewServices[String(projectId || "")]?.[String(targetId || "")] || null;
}

export function previewServicesForProject(projectId) {
  return Object.values(appState.previewServices[String(projectId || "")] || {});
}

export function allPreviewServices() {
  const services = [];
  const seen = new Set();
  for (const [projectId, targets] of Object.entries(appState.previewServices)) {
    for (const service of Object.values(targets || {})) {
      services.push({ projectId, service });
      seen.add(service);
    }
  }
  for (const [projectId, service] of Object.entries(appState.previewServers)) {
    if (service && !seen.has(service)) services.push({ projectId, service });
  }
  return services;
}

export function storePreviewService(projectId, targetId, service) {
  const projectKey = String(projectId || "");
  const targetKey = String(targetId || "");
  appState.previewServices[projectKey] ||= {};
  appState.previewServices[projectKey][targetKey] = service;
  return service;
}

export function removePreviewService(projectId, targetId, expected = null) {
  const projectKey = String(projectId || "");
  const targetKey = String(targetId || "");
  const services = appState.previewServices[projectKey];
  const service = services?.[targetKey];
  if (!service || (expected && service !== expected)) return null;
  delete services[targetKey];
  if (Object.keys(services).length === 0) delete appState.previewServices[projectKey];
  return service;
}

export function activatePreviewService(projectId, targetId) {
  const service = previewService(projectId, targetId);
  if (!service) return null;
  appState.previewServers[String(projectId || "")] = service;
  return service;
}

export function reconcileActivePreviewService(projectId, removed = null) {
  const projectKey = String(projectId || "");
  if (removed && appState.previewServers[projectKey] !== removed) return;
  const replacement = previewServicesForProject(projectKey).find((service) => service?.url) || null;
  if (replacement) appState.previewServers[projectKey] = replacement;
  else delete appState.previewServers[projectKey];
}

export function previewServiceTargetId(projectId, service) {
  if (!service) return "";
  if (service.targetId) return service.targetId;
  const entries = Object.entries(appState.previewServices[String(projectId || "")] || {});
  return entries.find(([, candidate]) => candidate === service)?.[0] || "";
}
