import { readBody, send } from "./http.mjs";
import { discoverProjects, projectById } from "./projects.mjs";
import { previewUrl } from "./preview.mjs";
import {
  activePairedDevice,
  appState,
  connectionUrls,
  event,
  machineName,
  PAIR_CODE,
  pushEvents,
  startedAt,
  TOKEN
} from "./state.mjs";

export function isAuthed(req) {
  return req.headers.authorization === `Bearer ${TOKEN}`;
}

export function healthPayload() {
  const pairedDevice = activePairedDevice();
  return {
    ok: true,
    machineName,
    paired: Boolean(pairedDevice),
    pairedDevice,
    startedAt,
    preview: appState.latestPreview,
    connectionUrls: connectionUrls()
  };
}

export async function approvePairing() {
  if (!appState.pendingPair) return;
  const pendingPair = appState.pendingPair;
  appState.pendingPair = { ...pendingPair, status: "approved" };
  await discoverProjects();
  pushEvents([event("Pairing", `${pendingPair.deviceName} approved in Vibyra Desktop`, "success")]);
}

export function denyPairing() {
  if (!appState.pendingPair) return;
  appState.pendingPair = { ...appState.pendingPair, status: "denied" };
  pushEvents([event("Pairing", "Pairing request denied", "error")]);
}

export async function pairDevice(req, res) {
  const body = await readBody(req);
  const code = String(body.code ?? "").trim().toUpperCase();
  const autoPair = body.autoPair === true;
  if (!autoPair && code !== PAIR_CODE) {
    send(res, 401, { ok: false, error: "Pair code does not match" });
    return;
  }
  const requestId = String(body.requestId ?? "").trim();
  if (requestId && appState.pendingPair?.clientRequestId === requestId && appState.pendingPair.status === "approved") {
    send(res, 200, { ok: true, status: "approved", token: TOKEN, machineName, projects: appState.cachedProjects, events: appState.events });
    return;
  }
  if (appState.pendingPair?.status === "pending") {
    if (!appState.pendingPair.clientRequestId || requestId === appState.pendingPair.clientRequestId) {
      send(res, 202, { ok: true, status: "pending", requestId: appState.pendingPair.id, machineName });
      return;
    }
    send(res, 409, { ok: false, error: "A pairing request is already waiting for approval" });
    return;
  }
  appState.pendingPair = {
    id: requestId || `pair-${Date.now()}`,
    clientRequestId: requestId || null,
    deviceName: String(body.deviceName ?? "iPhone"),
    requestedAt: new Date().toISOString(),
    status: "pending"
  };
  pushEvents([event("Pairing", `${appState.pendingPair.deviceName} is asking to pair`, "warning")]);
  send(res, 202, { ok: true, status: "pending", requestId: appState.pendingPair.id, machineName });
}

export async function pairStatus(res, requestId) {
  if (!appState.pendingPair || appState.pendingPair.id !== requestId) {
    send(res, 404, { ok: false, error: "Pair request not found" });
    return;
  }
  if (appState.pendingPair.status === "approved") {
    send(res, 200, { ok: true, status: "approved", token: TOKEN, machineName, projects: appState.cachedProjects, events: appState.events });
    return;
  }
  if (appState.pendingPair.status === "denied") {
    send(res, 403, { ok: false, status: "denied", error: "Desktop denied pairing" });
    return;
  }
  send(res, 200, { ok: true, status: "pending", machineName });
}

export async function startPreview(req, res) {
  const body = await readBody(req);
  appState.selectedProjectId = String(body.projectId ?? "");
  const project = projectById(appState.selectedProjectId);
  appState.latestPreview = {
    state: "live",
    url: project ? previewUrl(project.id, TOKEN) : null,
    title: project?.name ?? "Project",
    message: "Live preview stream started",
    capturedAt: new Date().toISOString()
  };
  const log = event("Preview", `Live preview started for ${project?.name ?? "project"}`, "success");
  pushEvents([log]);
  send(res, 200, { preview: appState.latestPreview, events: [log] });
}
