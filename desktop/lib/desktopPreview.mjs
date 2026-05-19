import { projectById, discoverProjects } from "./projects.mjs";
import { resolvedPreviewUrl } from "./preview.mjs";
import { appState, event, pushEvents } from "./state.mjs";

export async function openDesktopPreview(body, requestHost) {
  const projectId = String(body?.projectId || appState.selectedProjectId || "").trim();
  if (!projectId) {
    const error = new Error("Choose a desktop project before opening a preview.");
    error.status = 422;
    throw error;
  }

  let project = projectById(projectId);
  if (!project) {
    await discoverProjects();
    project = projectById(projectId);
  }
  if (!project) {
    const error = new Error("That desktop project is no longer available.");
    error.status = 404;
    throw error;
  }

  const url = await resolvedPreviewUrl(project, requestHost);
  appState.latestPreview = {
    state: "live",
    url,
    title: project.name,
    message: url ? "Live preview opened from Vibyra Desktop" : "No runnable preview is available for this folder yet.",
    capturedAt: new Date().toISOString()
  };
  const log = event("Preview", url ? `Live preview opened for ${project.name}` : `No runnable preview found for ${project.name}`, url ? "success" : "warning");
  pushEvents([log]);
  return { ok: true, events: [log], preview: appState.latestPreview };
}
