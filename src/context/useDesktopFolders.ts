import { DesktopBrowseListing, LogEvent, Project } from "../types/domain";

type Requests = {
  agentRequest: <T>(endpoint: string, options?: RequestInit, useAuth?: boolean) => Promise<T>;
};
type Logs = {
  appendLog: (message: string, source?: string, tone?: LogEvent["tone"]) => void;
};

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
    if (!hasConnection) return { current: null, parentPath: null, entries: [] };
    try {
      const suffix = path ? `?path=${encodeURIComponent(path)}` : "";
      return await requests.agentRequest<DesktopBrowseListing>(`/desktop/browse${suffix}`);
    } catch (error) {
      logs.appendLog(error instanceof Error ? error.message : "Desktop browse failed", "Desktop", "warning");
      return { current: null, parentPath: null, entries: [] };
    }
  }

  return { browseDesktopPath, loadDesktopFolders, searchDesktopFolders };
}
