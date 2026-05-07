import { readBody, send } from "./http.mjs";
import { discoverProjects, projectById } from "./projects.mjs";
import { previewUrl } from "./preview.mjs";
import {
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
  return {
    ok: true,
    machineName,
    pairCode: PAIR_CODE,
    paired: Boolean(appState.pairedDevice),
    pairedDevice: appState.pairedDevice,
    startedAt,
    preview: appState.latestPreview,
    connectionUrls: connectionUrls()
  };
}

export async function approvePairing() {
  if (!appState.pendingPair) return;
  const pendingPair = appState.pendingPair;
  appState.pairedDevice = pendingPair.deviceName;
  await discoverProjects();
  appState.pendingPair = { ...pendingPair, status: "approved" };
  pushEvents([event("Pairing", `${appState.pairedDevice} approved in Vibyra Desktop`, "success")]);
}

export function denyPairing() {
  if (!appState.pendingPair) return;
  appState.pendingPair = { ...appState.pendingPair, status: "denied" };
  pushEvents([event("Pairing", "Pairing request denied", "error")]);
}

export async function pairDevice(req, res) {
  const body = await readBody(req);
  if (String(body.code ?? "").trim().toUpperCase() !== PAIR_CODE) {
    send(res, 401, { ok: false, error: "Pair code does not match" });
    return;
  }
  appState.pendingPair = {
    id: `pair-${Date.now()}`,
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
