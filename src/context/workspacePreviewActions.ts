import type { FileEntry, GeneratedApp, LogEvent, PreviewServerPhase, PreviewState } from "../types/domain";
import { resolveReachableDesktopPreviewUrl } from "../utils/previewUrls";
import { DesktopRequestError } from "./useRequests";
import type { WorkspaceLogs, WorkspaceRequests, WorkspaceStore } from "./workspaceActionTypes";

type PreviewServerResult = {
  command: string;
  events: LogEvent[];
  preview: { state: PreviewState; title?: string | null; url?: string | null };
};

export function createWorkspacePreviewActions(store: WorkspaceStore, requests: WorkspaceRequests, logs: WorkspaceLogs) {
  const { state, setters } = store;
  async function loadProjectReviewFiles(projectId: string, projectPath = ""):
    Promise<{ files: Pick<FileEntry, "body" | "language" | "path">[]; totalFiles?: number; truncated?: boolean }> {
    if (!state.connection) return { files: [], totalFiles: 0, truncated: true };
    try {
      const pathQuery = projectPath ? `&projectPath=${encodeURIComponent(projectPath)}` : "";
      return await requests.agentRequest(
        `/files/review-bundle?projectId=${encodeURIComponent(projectId)}${pathQuery}`
      );
    } catch (error) {
      logs.appendLog(error instanceof Error ? error.message : "Could not prepare project files for review", "Projects", "warning");
      return { files: [], totalFiles: 0, truncated: true };
    }
  }

  async function startPreviewServer(
    projectId: string, projectName?: string, onProgress?: (phase: PreviewServerPhase, detail?: string) => void
  ): Promise<GeneratedApp> {
    const connection = state.connection;
    if (!connection) throw new Error("Connect Vibyra Desktop before starting a preview server.");
    onProgress?.("requesting-desktop", "POST /preview/start-server");
    const result = await requestPreviewServerStart(projectId);
    setters.setPreviewState(result.preview.state);
    logs.appendLogs(result.events);
    onProgress?.("starting-server", result.preview.title || projectName || "Desktop preview route");
    onProgress?.("verifying-phone", result.preview.url ?? undefined);
    const url = await resolveReachableDesktopPreviewUrl(connection, result.preview.url);
    if (!url) throw new Error("Vibyra Desktop started the preview server, but this phone could not load the preview route or its scripts. Restart Vibyra Desktop, reconnect this phone, then try Preview again.");
    onProgress?.("ready", url);
    return { id: `desktop-dev-preview-${projectId}-${Date.now()}`, projectId, source: "desktop",
      title: result.preview.title || projectName || "Live preview", url };
  }

  async function requestPreviewServerStart(projectId: string): Promise<PreviewServerResult> {
    try {
      return await requests.agentRequest("/preview/start-server", {
        method: "POST", body: JSON.stringify({ projectId })
      });
    } catch (error) {
      if (error instanceof DesktopRequestError && error.status === 404 && /unknown vibyra desktop route/i.test(error.message)) {
        throw new Error("Vibyra Desktop is still running an older bridge that cannot start previews from your phone yet. Quit and reopen Vibyra Desktop, reconnect this phone, then try Preview again.");
      }
      throw error;
    }
  }
  return { loadProjectReviewFiles, startPreviewServer };
}
