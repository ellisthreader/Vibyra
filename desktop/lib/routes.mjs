import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { startAgentTask, applyAgentTask, discardAgentTask, runCommand } from "./agent.mjs";
import { sendSafeAsset } from "./assetRoutes.mjs";
import { authorizeDesktopUi } from "./desktopUiAuth.mjs";
import { createProjectFile, listProjectFiles, readProjectFile } from "./files.mjs";
import { readBody, send, sendFile } from "./http.mjs";
import { analyzeDesktopProject, browseDesktopPath, createDesktopProject, discoverProjects, listDesktopFolders, searchDesktopProjects } from "./projects.mjs";
import { promptProjectContext } from "./projectContext.mjs";
import { appState, disconnectPhone, event, markPhoneConnected, publicState, pushEvents } from "./state.mjs";
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
const appAssetsDir = join(__dirname, "..", "..", "src", "assets");
const desktopAssetsDir = join(desktopDir, "assets");

export async function handle(req, res) {
  if (req.method === "OPTIONS") {
    send(res, 204, {});
    return;
  }

  const url = new URL(req.url ?? "/", `http://${req.headers.host}`);

  try {
    if (await handleDesktopRoutes(req, res, url)) return;
    if (await handlePairingRoutes(req, res, url)) return;
    if (!authorizePhone(req, res)) return;
    if (await handleAuthedRoutes(req, res, url)) return;
    send(res, 404, { ok: false, error: "Unknown Vibyra Desktop route" });
  } catch (error) {
    send(res, 500, { ok: false, error: error instanceof Error ? error.message : "Desktop app error" });
  }
}

async function handleDesktopRoutes(req, res, url) {
  if (req.method === "GET" && url.pathname === "/desktop/folders") {
    if (!authorizePhone(req, res)) return true;
    send(res, 200, { folders: await listDesktopFolders() });
    return true;
  }
  if (req.method === "GET" && url.pathname === "/desktop/search") {
    if (!authorizePhone(req, res)) return true;
    send(res, 200, { matches: await searchDesktopProjects(url.searchParams.get("q")) });
    return true;
  }
  if (req.method === "GET" && url.pathname === "/desktop/browse") {
    if (!authorizePhone(req, res)) return true;
    send(res, 200, await browseDesktopPath(url.searchParams.get("path")));
    return true;
  }
  if (req.method === "GET" && url.pathname === "/desktop/analyze") { if (!authorizePhone(req, res)) return true; send(res, 200, { project: await analyzeDesktopProject(url.searchParams.get("path")) }); return true; }
  if (req.method === "GET" && url.pathname === "/desktop/context") { if (!authorizePhone(req, res)) return true; send(res, 200, await promptProjectContext(url.searchParams.get("projectId"), url.searchParams.get("q"))); return true; }
  if (req.method === "GET" && url.pathname === "/desktop/state") {
    if (!authorizeDesktopUi(req, res)) return true;
    send(res, 200, publicState());
    return true;
  }
  if (req.method === "POST" && url.pathname === "/desktop/approve") {
    if (!authorizeDesktopUi(req, res)) return true;
    await approvePairing();
    send(res, 200, publicState());
    return true;
  }
  if (req.method === "POST" && url.pathname === "/desktop/deny") {
    if (!authorizeDesktopUi(req, res)) return true;
    denyPairing();
    send(res, 200, publicState());
    return true;
  }
  if (req.method === "POST" && url.pathname === "/desktop/quit") {
    if (!authorizeDesktopUi(req, res)) return true;
    send(res, 200, { ok: true });
    appState.server?.close(() => process.exit(0));
    return true;
  }
  if (req.method === "GET" && url.pathname === "/desktop") {
    if (!authorizeDesktopUi(req, res, false)) return true;
    await sendFile(res, join(desktopDir, "app.html"));
    return true;
  }
  if (req.method === "GET" && url.pathname.startsWith("/app-assets/")) {
    if (!authorizeDesktopUi(req, res, false)) return true;
    await sendSafeAsset(res, appAssetsDir, url.pathname, "/app-assets/");
    return true;
  }
  if (req.method === "GET" && url.pathname.startsWith("/desktop/assets/")) {
    if (!authorizeDesktopUi(req, res, false)) return true;
    await sendSafeAsset(res, desktopAssetsDir, url.pathname, "/desktop/assets/");
    return true;
  }
  if (req.method === "GET" && url.pathname.startsWith("/desktop/")) {
    if (!authorizeDesktopUi(req, res, false)) return true;
    await sendFile(res, join(desktopDir, basename(url.pathname.replace("/desktop/", ""))));
    return true;
  }
  return false;
}

function authorizePhone(req, res) {
  if (!isAuthed(req)) { send(res, 401, { ok: false, error: "Missing or invalid desktop token" }); return false; }
  markPhoneConnected();
  return true;
}

async function handlePairingRoutes(req, res, url) {
  if (req.method === "GET" && url.pathname === "/health") { send(res, 200, healthPayload()); return true; }
  if (req.method === "GET" && url.pathname.startsWith("/preview/project/")) {
    await serveProjectPreview(res, url);
    return true;
  }
  if (req.method === "POST" && url.pathname === "/pair") { await pairDevice(req, res); return true; }
  if (req.method === "GET" && url.pathname === "/pair/status") { await pairStatus(res, url.searchParams.get("requestId")); return true; }
  return false;
}

async function handleAuthedRoutes(req, res, url) {
  if (req.method === "POST" && url.pathname === "/desktop/disconnect") {
    disconnectPhone("Phone disconnected from Vibyra Desktop");
    send(res, 200, publicState());
    return true;
  }
  if (req.method === "GET" && url.pathname === "/projects") {
    send(res, 200, { projects: await discoverProjects() });
    return true;
  }
  if (req.method === "POST" && url.pathname === "/projects/create") {
    const body = await readBody(req);
    const project = await createDesktopProject(body.name);
    const files = await listProjectFiles(project.id);
    const projects = [project, ...(await discoverProjects()).filter((item) => item.id !== project.id)].slice(0, 12);
    const log = event("Projects", `Created ${project.name}`, "success");
    appState.cachedProjects = projects;
    pushEvents([log]);
    send(res, 200, {
      project,
      projects,
      files,
      events: [log]
    });
    return true;
  }
  if (req.method === "GET" && url.pathname === "/files") {
    send(res, 200, { files: await listProjectFiles(url.searchParams.get("projectId")) });
    return true;
  }
  if (req.method === "GET" && url.pathname === "/files/read") {
    send(res, 200, {
      file: await readProjectFile(url.searchParams.get("projectId"), url.searchParams.get("path"))
    });
    return true;
  }
  if (req.method === "POST" && url.pathname === "/files/create") {
    send(res, 200, await createProjectFile(await readBody(req)));
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
  if (req.method === "POST" && url.pathname === "/agents/apply") {
    send(res, 200, await applyAgentTask(await readBody(req)));
    return true;
  }
  if (req.method === "POST" && url.pathname === "/agents/discard") {
    send(res, 200, discardAgentTask(await readBody(req)));
    return true;
  }
  if (req.method === "POST" && url.pathname === "/commands/run") {
    send(res, 200, await runCommand(await readBody(req)));
    return true;
  }
  return false;
}
