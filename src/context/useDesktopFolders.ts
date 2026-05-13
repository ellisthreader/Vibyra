import { DesktopBrowseListing, LogEvent, Project } from "../types/domain";

type Requests = {
  agentRequest: <T>(endpoint: string, options?: RequestInit, useAuth?: boolean) => Promise<T>;
};
type Logs = {
  appendLog: (message: string, source?: string, tone?: LogEvent["tone"]) => void;
};

function friendlyBrowseError(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes("failed to fetch") || lower.includes("network request failed")) {
    return "I couldn't reach Vibyra Desktop. Check that the desktop app is still running and your phone is on the same network.";
  }
  if (lower.includes("request timed out")) {
    return "Your PC took too long to list that folder. Try a smaller folder, or check that Vibyra Desktop is still connected.";
  }
  if (lower.includes("secure desktop session expired")) {
    return "Your secure desktop session expired. Reconnect this phone to Vibyra Desktop, then browse again.";
  }
  if (lower.includes("401") || lower.includes("unauthorized")) {
    return "Your phone needs to reconnect to Vibyra Desktop before browsing files.";
  }
  if (lower.includes("404") || lower.includes("folder is not available")) {
    return "That folder is not available on your PC anymore. Go up a level or choose another folder.";
  }
  if (lower.includes("desktop browse failed")) {
    return "I couldn't list folders from your PC. Check that Vibyra Desktop is connected.";
  }
  return message || "I couldn't list folders from your PC.";
}

export function useDesktopFolders(hasConnection: boolean, requests: Requests, logs: Logs) {
  async function loadDesktopFolders(): Promise<Project[]> {
    if (!hasConnection) return [];
    try {
      const result = await requests.agentRequest<{ folders: Project[] }>("/desktop/folders");
      return (result.folders ?? []).map((folder) => ({ ...folder, source: "desktop" as const }));
    } catch (error) {
      logs.appendLog(error instanceof Error ? error.message : "Could not list desktop folders", "Desktop", "warning");
      return [];
    }
  }

  async function searchDesktopFolders(query: string): Promise<Project[]> {
    const trimmed = query.trim();
    if (!hasConnection || trimmed.length === 0) return [];
    try {
      const endpoint = `/desktop/search?q=${encodeURIComponent(trimmed)}`;
      const result = await requests.agentRequest<{ matches: Project[] }>(endpoint);
      return (result.matches ?? []).map((match) => ({
        ...match,
        source: match.source ?? "desktop"
      }));
    } catch (error) {
      logs.appendLog(error instanceof Error ? error.message : "Desktop search failed", "Desktop", "warning");
      return [];
    }
  }

  async function browseDesktopPath(path?: string): Promise<DesktopBrowseListing> {
    if (!hasConnection) {
      throw new Error("Vibyra Desktop is not connected to this device.");
    }
    try {
      const suffix = path ? `?path=${encodeURIComponent(path)}` : "";
      return await requests.agentRequest<DesktopBrowseListing>(`/desktop/browse${suffix}`, {}, true);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Desktop browse failed";
      logs.appendLog(message, "Desktop", "warning");
      throw new Error(friendlyBrowseError(message));
    }
  }

  async function analyzeDesktopProject(project: Project): Promise<Project> {
    if (!hasConnection || !project.path) return project;
    try {
      const result = await requests.agentRequest<{ project: Project }>(`/desktop/analyze?path=${encodeURIComponent(project.path)}`, {}, true);
      return { ...project, ...result.project, source: result.project.source ?? project.source };
    } catch (error) {
      logs.appendLog(error instanceof Error ? error.message : "Desktop analysis failed", "Desktop", "warning");
      return project;
    }
  }

  return { analyzeDesktopProject, browseDesktopPath, loadDesktopFolders, searchDesktopFolders };
}
