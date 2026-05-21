import { startAgentTask, applyAgentTask, discardAgentTask, runCommand } from "./agent.mjs";
import { currentAgentRun, listAgentRuns } from "./agentRunState.mjs";
import { createProjectFile, listProjectFiles, listProjectReviewFiles, readProjectFile } from "./files.mjs";
import { authorizePhone, handleDesktopRoutes } from "./desktopRoutes.mjs";
import { readBody, send } from "./http.mjs";
import { createDesktopProject, discoverProjects } from "./projects.mjs";
import { appState, disconnectPhone, event, publicState, pushEvents } from "./state.mjs";
import { servePreviewRefererAsset, servePreviewServerProxy, servePreviewUrlProxy, serveProjectPreview } from "./preview.mjs";
import {
  approvePairing,
  denyPairing,
  healthPayload,
  pairDevice,
  pairStatus,
  startPreview,
  startPreviewServer
} from "./pairingHandlers.mjs";

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
    const status = error && typeof error === "object" && "status" in error ? Number(error.status) : 500;
    const body = { ok: false, error: error instanceof Error ? error.message : "Desktop app error" };
    if (error && typeof error === "object") {
      if ("code" in error && error.code) body.code = String(error.code);
      if ("resetAt" in error && error.resetAt) body.resetAt = String(error.resetAt);
      if ("burstCreditsResetAt" in error && error.burstCreditsResetAt) body.burstCreditsResetAt = String(error.burstCreditsResetAt);
      if ("weeklyCreditsResetAt" in error && error.weeklyCreditsResetAt) body.weeklyCreditsResetAt = String(error.weeklyCreditsResetAt);
    }
    send(res, status >= 400 && status < 600 ? status : 500, body);
  }
}

async function handlePairingRoutes(req, res, url) {
  if (req.method === "GET" && url.pathname === "/health") { send(res, 200, healthPayload()); return true; }
  if (req.method === "GET" && url.pathname.startsWith("/preview/project/")) {
    await serveProjectPreview(res, url);
    return true;
  }
  if (url.pathname.startsWith("/preview/server/")) {
    await servePreviewServerProxy(req, res, url);
    return true;
  }
  if (req.method === "GET" && url.pathname.startsWith("/preview/proxy-url/")) {
    await servePreviewUrlProxy(req, res, url);
    return true;
  }
  if (await servePreviewRefererAsset(req, res, url, req.headers.referer || req.headers.referrer)) {
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
  if (req.method === "GET" && url.pathname === "/files/review-bundle") {
    send(res, 200, await listProjectReviewFiles(url.searchParams.get("projectId")));
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
      agentRuns: listAgentRuns(appState),
      activeAgentRun: currentAgentRun(appState)
    });
    return true;
  }
  if (req.method === "POST" && url.pathname === "/preview/start") {
    await startPreview(req, res);
    return true;
  }
  if (req.method === "POST" && url.pathname === "/preview/start-server") {
    await startPreviewServer(req, res);
    return true;
  }
  if (req.method === "POST" && url.pathname === "/agents/start") {
    send(res, 200, await startAgentTask({ ...(await readBody(req)), requestHost: req.headers.host }));
    return true;
  }
  if (req.method === "POST" && url.pathname === "/agents/apply") {
    send(res, 200, await applyAgentTask({ ...(await readBody(req)), requestHost: req.headers.host }));
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
