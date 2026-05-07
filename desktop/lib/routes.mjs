import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { startAgentTask, runCommand } from "./agent.mjs";
import { readBody, send, sendFile } from "./http.mjs";
import { discoverProjects } from "./projects.mjs";
import { appState, publicState } from "./state.mjs";
import { serveProjectPreview } from "./preview.mjs";
import {
  approvePairing,
  denyPairing,
  healthPayload,
  isAuthed,
  pairDevice,
  pairStatus,
  startPreview
} from "./pairingHandlers.mjs";

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
  if (req.method === "GET" && url.pathname.startsWith("/preview/project/")) {
    await serveProjectPreview(res, url);
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
      selectedProjectId: appState.selectedProjectId,
      activeAgentRun: appState.activeAgentRun
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
