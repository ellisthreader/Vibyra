import { readBody, send } from "./http.mjs";
import { sameAccountPairCheck } from "./desktopAccount.mjs";
import { discoverProjects, projectById } from "./projects.mjs";
import { previewServerProxyUrl, resolvedPreviewUrl } from "./preview.mjs";
import { startProjectDevServer } from "./previewDevServer.mjs";
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
  if (!appState.desktopAccount?.id) {
    appState.pendingPair = { ...appState.pendingPair, status: "denied" };
    pushEvents([event("Pairing", "Pairing denied because Vibyra Desktop is not signed in", "error")]);
    return;
  }
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
  const accountCheck = sameAccountPairCheck(body);
  if (!accountCheck.ok) {
    send(res, accountCheck.status, { ok: false, error: accountCheck.error });
    return;
  }

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
    accountId: appState.desktopAccount.id,
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
  if (appState.pendingPair.accountId !== appState.desktopAccount?.id) {
    send(res, 403, { ok: false, status: "denied", error: "Desktop account changed before pairing completed" });
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
  const url = project ? await resolvedPreviewUrl(project, req.headers.host, TOKEN) : null;
  appState.latestPreview = {
    state: "live",
    url,
    title: project?.name ?? "Project",
    message: url ? "Live preview stream started" : "No runnable preview is available for this folder yet.",
    capturedAt: new Date().toISOString()
  };
  const log = event("Preview", url ? `Live preview started for ${project?.name ?? "project"}` : `No runnable preview found for ${project?.name ?? "project"}`, url ? "success" : "warning");
  pushEvents([log]);
  send(res, 200, { preview: appState.latestPreview, events: [log] });
}

export async function startPreviewServer(req, res) {
  const body = await readBody(req);
  appState.selectedProjectId = String(body.projectId ?? "");
  const project = projectById(appState.selectedProjectId);
  if (!project) throw new Error("No project selected for preview.");
  const result = await startProjectDevServer(project, req.headers.host, { timeoutMs: 80000 });
  const url = previewServerProxyUrl(project.id, TOKEN);
  appState.latestPreview = {
    state: "live",
    url,
    title: project.name,
    message: result.started ? "Desktop preview started" : "Desktop preview already running",
    capturedAt: new Date().toISOString()
  };
  const log = event("Preview", `${result.started ? "Started" : "Found"} live preview for ${project.name}`, "success");
  pushEvents([log]);
  send(res, 200, { command: result.command, events: [log], preview: appState.latestPreview });
}
