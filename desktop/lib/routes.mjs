import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { startAgentTask, runCommand } from "./agent.mjs";
import { readBody, send, sendFile } from "./http.mjs";
import { discoverProjects, projectById } from "./projects.mjs";
import {
  appState,
  connectionUrls,
  event,
  machineName,
  PAIR_CODE,
  publicState,
  pushEvents,
  startedAt,
  TOKEN
} from "./state.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const desktopDir = join(__dirname, "..");

export async function handle(req, res) {
  if (req.method === "OPTIONS") {
    send(res, 204, {});
    return;
  }

  const url = new URL(req.url ?? "/", `http://${req.headers.host}`);

  try {
    if (await handleDesktopRoutes(req, res, url)) return;
    if (await handlePairingRoutes(req, res, url)) return;
    if (!isAuthed(req)) {
      send(res, 401, { ok: false, error: "Missing or invalid desktop token" });
      return;
    }
    if (await handleAuthedRoutes(req, res, url)) return;
    send(res, 404, { ok: false, error: "Unknown Vibyra Desktop route" });
  } catch (error) {
    send(res, 500, { ok: false, error: error instanceof Error ? error.message : "Desktop app error" });
  }
}

async function handleDesktopRoutes(req, res, url) {
  if (req.method === "GET" && url.pathname === "/desktop/state") {
    send(res, 200, publicState());
    return true;
  }
  if (req.method === "POST" && url.pathname === "/desktop/approve") {
    await approvePairing();
    send(res, 200, publicState());
    return true;
  }
  if (req.method === "POST" && url.pathname === "/desktop/deny") {
    denyPairing();
    send(res, 200, publicState());
    return true;
  }
  if (req.method === "POST" && url.pathname === "/desktop/quit") {
    send(res, 200, { ok: true });
    appState.server?.close(() => process.exit(0));
    return true;
  }
  if (req.method === "GET" && url.pathname === "/desktop") {
    await sendFile(res, join(desktopDir, "index.html"));
    return true;
  }
  if (req.method === "GET" && url.pathname.startsWith("/desktop/")) {
    await sendFile(res, join(desktopDir, basename(url.pathname.replace("/desktop/", ""))));
    return true;
  }
  return false;
}

async function handlePairingRoutes(req, res, url) {
  if (req.method === "GET" && url.pathname === "/health") {
    send(res, 200, healthPayload());
    return true;
  }
  if (req.method === "POST" && url.pathname === "/pair") {
    await pairDevice(req, res);
    return true;
  }
  if (req.method === "GET" && url.pathname === "/pair/status") {
    await pairStatus(res, url.searchParams.get("requestId"));
    return true;
  }
  return false;
}

async function handleAuthedRoutes(req, res, url) {
  if (req.method === "GET" && url.pathname === "/projects") {
    send(res, 200, { projects: await discoverProjects() });
    return true;
  }
  if (req.method === "GET" && url.pathname === "/events") {
    send(res, 200, {
      events: appState.events,
      preview: appState.latestPreview,
      selectedProjectId: appState.selectedProjectId
    });
    return true;
  }
  if (req.method === "POST" && url.pathname === "/preview/start") {
    await startPreview(req, res);
    return true;
  }
  if (req.method === "POST" && url.pathname === "/agents/start") {
    send(res, 200, await startAgentTask(await readBody(req)));
    return true;
  }
  if (req.method === "POST" && url.pathname === "/commands/run") {
    send(res, 200, await runCommand(await readBody(req)));
    return true;
  }
  return false;
}

async function approvePairing() {
  if (!appState.pendingPair) return;
  const pendingPair = appState.pendingPair;
  appState.pairedDevice = pendingPair.deviceName;
  await discoverProjects();
  appState.pendingPair = { ...pendingPair, status: "approved" };
  pushEvents([event("Pairing", `${appState.pairedDevice} approved in Vibyra Desktop`, "success")]);
}

function denyPairing() {
  if (!appState.pendingPair) return;
  appState.pendingPair = { ...appState.pendingPair, status: "denied" };
  pushEvents([event("Pairing", "Pairing request denied", "error")]);
}

function healthPayload() {
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

async function pairDevice(req, res) {
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

async function pairStatus(res, requestId) {
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

async function startPreview(req, res) {
  const body = await readBody(req);
  appState.selectedProjectId = String(body.projectId ?? "");
  const project = projectById(appState.selectedProjectId);
  appState.latestPreview = {
    state: "live",
    url: `http://localhost:3000/${project?.name.toLowerCase().replace(/\s+/g, "-") ?? "project"}`,
    title: project?.name ?? "Project",
    message: "Live preview stream started",
    capturedAt: new Date().toISOString()
  };
  const log = event("Preview", `Live preview started for ${project?.name ?? "project"}`, "success");
  pushEvents([log]);
  send(res, 200, { preview: appState.latestPreview, events: [log] });
}

function isAuthed(req) {
  return req.headers.authorization === `Bearer ${TOKEN}`;
}
