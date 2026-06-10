import { readBody, send } from "./http.mjs";
import { sameAccountPairCheck } from "./desktopAccount.mjs";
import { discoverProjects, projectById } from "./projects.mjs";
import { previewServerProxyUrl, resolvedPreviewUrl } from "./preview.mjs";
import { startProjectDevServer } from "./previewDevServer.mjs";
import {
  replacePreviewCapability,
  revokeAllPreviewCapabilities,
  revokePreviewCapability
} from "./previewCapabilities.mjs";
import {
  approvedPairPayload,
  checkPairingRateLimit,
  expirePairingRequest,
  isAuthed,
  isValidPairRequestId,
  readPairingBody,
  sendPairingRateLimit
} from "./pairingSecurity.mjs";
import {
  activePairedDevice,
  appState,
  connectionUrls,
  event,
  machineName,
  PAIR_CODE,
  pushEvents,
  startedAt
} from "./state.mjs";
import { loadOrCreateDesktopIdentity } from "./lanV2Identity.mjs";
import { LAN_V2_PROTOCOL, lanV2Enabled, lanV2Required } from "./lanV2Protocol.mjs";

export { isAuthed };

export function healthPayload() {
  const pairedDevice = activePairedDevice();
  const v2Enabled = lanV2Enabled();
  const identity = v2Enabled ? loadOrCreateDesktopIdentity() : null;
  return {
    ok: true,
    machineName,
    paired: Boolean(pairedDevice),
    pairedDevice,
    startedAt,
    preview: appState.latestPreview,
    desktopAccountReady: Boolean(appState.desktopAccount?.id),
    lanV2: {
      supported: true,
      enabled: v2Enabled,
      required: lanV2Required(),
      protocol: LAN_V2_PROTOCOL,
      desktopId: identity?.desktopId ?? null,
      desktopPublicKey: identity?.publicKeyPem ?? null
    },
    connectionUrls: connectionUrls()
  };
}

export async function approvePairing() {
  appState.pendingPair = expirePairingRequest(appState.pendingPair);
  if (!appState.pendingPair || appState.pendingPair.status === "expired") return;
  if (!appState.desktopAccount?.id) {
    appState.pendingPair = { ...appState.pendingPair, status: "denied" };
    pushEvents([event("Pairing", "Pairing denied because Vibyra Desktop is not signed in", "error")]);
    return;
  }
  const pendingPair = appState.pendingPair;
  revokeAllPreviewCapabilities();
  appState.latestPreviewCredential = null;
  appState.pendingPair = { ...pendingPair, status: "approved", approvedAt: new Date().toISOString() };
  await discoverProjects();
  pushEvents([event("Pairing", `${pendingPair.deviceName} approved in Vibyra Desktop`, "success")]);
}

export function denyPairing() {
  appState.pendingPair = expirePairingRequest(appState.pendingPair);
  if (!appState.pendingPair || appState.pendingPair.status === "expired") return;
  appState.pendingPair = { ...appState.pendingPair, status: "denied" };
  pushEvents([event("Pairing", "Pairing request denied", "error")]);
}

export async function pairDevice(req, res) {
  const body = await readPairingBody(req);
  const requestLimit = checkPairingRateLimit(req, "pair", body.requestId);
  if (requestLimit) {
    sendPairingRateLimit(res, requestLimit);
    return;
  }
  appState.pendingPair = expirePairingRequest(appState.pendingPair);
  const accountCheck = sameAccountPairCheck(body);
  if (!accountCheck.ok) {
    send(res, accountCheck.status, { ok: false, error: accountCheck.error });
    return;
  }

  const code = body.code;
  const autoPair = body.autoPair === true;
  if (!autoPair && code !== PAIR_CODE) {
    send(res, 401, { ok: false, error: "Pair code does not match" });
    return;
  }
  const requestId = body.requestId;
  if (requestId && appState.pendingPair?.clientRequestId === requestId && appState.pendingPair.status === "approved") {
    send(res, 200, approvedPairPayload(appState.pendingPair));
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
    deviceName: body.deviceName,
    requestedAt: new Date().toISOString(),
    status: "pending"
  };
  pushEvents([event("Pairing", `${appState.pendingPair.deviceName} is asking to pair`, "warning")]);
  send(res, 202, { ok: true, status: "pending", requestId: appState.pendingPair.id, machineName });
}

export async function pairStatus(res, requestId, req = null) {
  const normalizedRequestId = String(requestId ?? "").trim();
  if (!isValidPairRequestId(normalizedRequestId)) {
    send(res, 400, { ok: false, error: "Pair request ID format is invalid" });
    return;
  }
  const rateLimit = checkPairingRateLimit(req, "status", normalizedRequestId);
  if (rateLimit) {
    sendPairingRateLimit(res, rateLimit);
    return;
  }
  appState.pendingPair = expirePairingRequest(appState.pendingPair);
  if (appState.pendingPair?.status === "expired" && appState.pendingPair.id === normalizedRequestId) {
    send(res, 410, { ok: false, status: "expired", error: "Pair request expired" });
    return;
  }
  if (!appState.pendingPair || appState.pendingPair.id !== normalizedRequestId) {
    send(res, 404, { ok: false, error: "Pair request not found" });
    return;
  }
  if (appState.pendingPair.accountId !== appState.desktopAccount?.id) {
    send(res, 403, { ok: false, status: "denied", error: "Desktop account changed before pairing completed" });
    return;
  }
  if (appState.pendingPair.status === "approved") {
    send(res, 200, approvedPairPayload(appState.pendingPair));
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
  const credential = project
    ? replacePreviewCapability(project.id, appState.latestPreviewCredential)
    : null;
  const url = project
    ? await resolvedPreviewUrl(project, req.headers.host, credential, { phoneVisible: true })
    : null;
  if (!url) revokePreviewCapability(credential);
  appState.latestPreview = {
    state: "live",
    url,
    title: project?.name ?? "Project",
    message: url ? "Live preview stream started" : "No runnable preview is available for this folder yet.",
    capturedAt: new Date().toISOString()
  };
  appState.latestPreviewCredential = url ? credential : null;
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
  const credential = replacePreviewCapability(project.id, appState.latestPreviewCredential);
  const url = previewServerProxyUrl(project.id, credential);
  appState.latestPreview = {
    state: "live",
    url,
    title: project.name,
    message: result.started ? "Desktop preview started" : "Desktop preview already running",
    capturedAt: new Date().toISOString()
  };
  appState.latestPreviewCredential = credential;
  const log = event("Preview", `${result.started ? "Started" : "Found"} live preview for ${project.name}`, "success");
  pushEvents([log]);
  send(res, 200, { command: result.command, events: [log], preview: appState.latestPreview });
}
