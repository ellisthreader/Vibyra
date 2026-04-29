import { PreviewState, Project, FileEntry, LogEvent } from "../types/domain";
import { dedupeFiles } from "../utils/files";
import { impact } from "../utils/haptics";
import { makeId } from "../utils/ids";
import { normalizeAgentUrl } from "../utils/network";
import { useAppState } from "./useAppState";

type Store = ReturnType<typeof useAppState>;
type Requests = {
  agentRequest: <T>(endpoint: string, options?: RequestInit, useAuth?: boolean) => Promise<T>;
  desktopRequest: <T>(baseUrl: string, endpoint: string, options?: RequestInit, timeoutMs?: number) => Promise<T>;
};
type Logs = {
  appendLog: (message: string, source?: string, tone?: LogEvent["tone"]) => void;
  appendLogs: (logs: Omit<LogEvent, "id" | "time">[]) => void;
  advanceWorkflow: (index: number) => void;
};

export function useWorkspaceActions(store: Store, requests: Requests, logs: Logs) {
  const { state, derived, setters } = store;

  async function createProject() {
    impact();
    if (!state.connection) {
      const project = makeLocalProject();
      setters.setProjects((current) => [project, ...current]);
      setters.setSelectedProjectId(project.id);
      return;
    }

    try {
      const result = await requests.agentRequest<ProjectCreateResult>("/projects/create", {
        method: "POST",
        body: JSON.stringify({ name: "Untitled Workspace" })
      });
      const nextFiles = dedupeFiles(result.files);
      setters.setProjects(result.projects);
      setters.setSelectedProjectId(result.project.id);
      setters.setFiles(nextFiles);
      setters.setSelectedFileId(nextFiles[0]?.id ?? "empty");
      setters.setPreviewState("live");
      logs.advanceWorkflow(5);
      logs.appendLogs(result.events);
    } catch (error) {
      logs.appendLog(error instanceof Error ? error.message : "Project creation failed", "Projects", "error");
    }
  }

  async function createFile() {
    const path = state.newFilePath.trim() || "note.txt";
    impact();
    if (!state.connection) return;

    try {
      const result = await requests.agentRequest<FileCreateResult>("/files/create", {
        method: "POST",
        body: JSON.stringify({ projectId: derived.selectedProject.id, path, content: `# ${path}\n\n` })
      });
      setters.setFiles(dedupeFiles(result.files));
      if (result.file) setters.setSelectedFileId(result.file.id);
      setters.setNewFilePath(`note-${Date.now()}.txt`);
      logs.appendLogs(result.events);
    } catch (error) {
      logs.appendLog(error instanceof Error ? error.message : "Could not create file", "Files", "error");
    }
  }

  async function loadProjectFiles(projectId: string) {
    if (!state.connection) return;
    try {
      const result = await requests.agentRequest<{ files: FileEntry[] }>(`/files?projectId=${encodeURIComponent(projectId)}`);
      setLoadedFiles(result.files);
    } catch (error) {
      clearFiles(error instanceof Error ? error.message : "Could not load files");
    }
  }

  async function loadProjectFilesWithConnection(url: string, token: string, projectId: string) {
    try {
      const result = await requests.desktopRequest<{ files: FileEntry[] }>(
        normalizeAgentUrl(url),
        `/files?projectId=${encodeURIComponent(projectId)}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setLoadedFiles(result.files);
    } catch (error) {
      clearFiles(error instanceof Error ? error.message : "Could not load files");
    }
  }

  async function selectFile(fileId: string) {
    impact();
    setters.setSelectedFileId(fileId);
    if (!state.connection) return;

    const file = state.files.find((item) => item.id === fileId);
    if (!file || file.body) return;

    try {
      const endpoint = `/files/read?projectId=${encodeURIComponent(derived.selectedProject.id)}&path=${encodeURIComponent(file.path)}`;
      const result = await requests.agentRequest<{ file: FileEntry }>(endpoint);
      setters.setFiles((current) => current.map((item) => (item.id === fileId ? result.file : item)));
    } catch (error) {
      logs.appendLog(error instanceof Error ? error.message : "Could not open file", "Files", "error");
    }
  }

  async function selectProject(projectId: string) {
    const project = state.projects.find((item) => item.id === projectId);
    impact();
    setters.setSelectedProjectId(projectId);
    setters.setPreviewState("live");
    logs.advanceWorkflow(5);
    logs.appendLogs([
      { source: "Preview", message: `Live preview started for ${project?.name ?? "project"}`, tone: "success" },
      { source: "Projects", message: `Selected ${project?.path ?? "project folder"}`, tone: "info" }
    ]);

    if (!state.connection) return;
    try {
      await loadProjectFiles(projectId);
      const result = await requests.agentRequest<{ preview: { state: PreviewState }; events: LogEvent[] }>(
        "/preview/start",
        { method: "POST", body: JSON.stringify({ projectId }) }
      );
      setters.setPreviewState(result.preview.state);
      logs.appendLogs(result.events);
    } catch (error) {
      logs.appendLog(error instanceof Error ? error.message : "Preview failed", "Desktop Agent", "error");
    }
  }

  function setLoadedFiles(files: FileEntry[]) {
    const nextFiles = dedupeFiles(files);
    setters.setFiles(nextFiles);
    setters.setSelectedFileId(nextFiles[0]?.id ?? "empty");
  }

  function clearFiles(message: string) {
    setters.setFiles([]);
    setters.setSelectedFileId("empty");
    logs.appendLog(message, "Files", "error");
  }

  return { createProject, createFile, loadProjectFilesWithConnection, selectFile, selectProject };
}

function makeLocalProject(): Project {
  return {
    id: makeId("project"),
    name: "Untitled Workspace",
    path: "~/Desktop/Vibyra Projects/untitled-workspace",
    stack: "New project",
    updated: "Now"
  };
}

type ProjectCreateResult = {
  project: Project;
  projects: Project[];
  files: FileEntry[];
  events: LogEvent[];
};

type FileCreateResult = {
  file: FileEntry | null;
  files: FileEntry[];
  events: LogEvent[];
};
