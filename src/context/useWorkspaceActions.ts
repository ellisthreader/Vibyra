import { PreviewState, Project, FileEntry, LogEvent } from "../types/domain";
import { dedupeFiles, mergeProjects } from "../utils/files";
import { impact } from "../utils/haptics";
import { normalizeAgentUrl } from "../utils/network";
import { useAppState } from "./useAppState";
import { useDesktopFolders } from "./useDesktopFolders";
import { FileCreateResult, ProjectCreateResult, makeLocalProject } from "./workspaceTypes";

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
  const desktopFolders = useDesktopFolders(Boolean(state.connection), requests, logs);

  async function createProject(): Promise<Project | null> {
    impact();
    if (!state.connection) {
      return createLocalProject();
    }

    try {
      const result = await requests.agentRequest<ProjectCreateResult>("/projects/create", {
        method: "POST",
        body: JSON.stringify({ name: "Untitled Workspace" })
      });
      const nextFiles = dedupeFiles(result.files);
      setters.setProjects((current) => mergeProjects(current, result.projects));
      setters.setSelectedProjectId(result.project.id);
      setters.setChatThreads((current) => ({ ...current, [result.project.id]: [] }));
      setters.setChatTitles((current) => ({ ...current, [result.project.id]: result.project.name }));
      setters.setChatProjects((current) => ({ ...current, [result.project.id]: result.project }));
      setters.setFiles(nextFiles);
      setters.setSelectedFileId(nextFiles[0]?.id ?? "empty");
      setters.setPreviewState("live");
      logs.advanceWorkflow(5);
      logs.appendLogs(result.events);
      return result.project;
    } catch (error) {
      logs.appendLog(error instanceof Error ? error.message : "Project creation failed", "Projects", "error");
      return createLocalProject();
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

  async function undoCodeChange(projectId: string, messageId: string, changeId: string, file: FileEntry) {
    if (!state.connection || file.previousBody === undefined || file.previousBody === null) return;

    try {
      const result = await requests.agentRequest<FileCreateResult>("/files/create", {
        method: "POST",
        body: JSON.stringify({ projectId, path: file.path, content: file.previousBody })
      });
      setters.setFiles(dedupeFiles(result.files));
      setters.setChatThreads((current) => {
        const thread = current[projectId];
        if (!thread) return current;
        return {
          ...current,
          [projectId]: thread.map((message) => (
            message.id === messageId
              ? { ...message, undoneChangeIds: Array.from(new Set([...(message.undoneChangeIds ?? []), changeId])) }
              : message
          ))
        };
      });
      logs.appendLogs(result.events);
      logs.appendLog(`Undid ${file.path}`, "Code Review", "success");
    } catch (error) {
      logs.appendLog(error instanceof Error ? error.message : "Could not undo file change", "Code Review", "error");
    }
  }

  async function loadProjectFiles(projectId: string) {
    if (!state.connection) return;
    try {
      const result = await requests.agentRequest<{ files: FileEntry[] }>(`/files?projectId=${encodeURIComponent(projectId)}`);
      const nextFiles = setLoadedFiles(result.files);
      await hydrateFirstFile(nextFiles, (path) => {
        const endpoint = `/files/read?projectId=${encodeURIComponent(projectId)}&path=${encodeURIComponent(path)}`;
        return requests.agentRequest<{ file: FileEntry }>(endpoint);
      });
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
      const nextFiles = setLoadedFiles(result.files);
      await hydrateFirstFile(nextFiles, (path) => {
        const endpoint = `/files/read?projectId=${encodeURIComponent(projectId)}&path=${encodeURIComponent(path)}`;
        return requests.desktopRequest<{ file: FileEntry }>(
          normalizeAgentUrl(url),
          endpoint,
          { headers: { Authorization: `Bearer ${token}` } }
        );
      });
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
    return nextFiles;
  }

  async function hydrateFirstFile(
    files: FileEntry[],
    readFile: (path: string) => Promise<{ file: FileEntry }>
  ) {
    const firstFile = files[0];
    if (!firstFile || firstFile.body) return;

    try {
      const result = await readFile(firstFile.path);
      setters.setFiles((current) => current.map((item) => (item.id === firstFile.id ? result.file : item)));
    } catch (error) {
      logs.appendLog(error instanceof Error ? error.message : "Could not open first file", "Files", "warning");
    }
  }

  function clearFiles(message: string) {
    setters.setFiles([]);
    setters.setSelectedFileId("empty");
    logs.appendLog(message, "Files", "error");
  }

  function createLocalProject() {
    const project = makeLocalProject();
    setters.setProjects((current) => [project, ...current]);
    setters.setSelectedProjectId(project.id);
    setters.setChatThreads((current) => ({ ...current, [project.id]: [] }));
    setters.setChatTitles((current) => ({ ...current, [project.id]: "New chat" }));
    setters.setChatProjects((current) => ({ ...current, [project.id]: project }));
    setters.setFiles([]);
    setters.setSelectedFileId("empty");
    setters.setPreviewState("live");
    logs.advanceWorkflow(5);
    logs.appendLog(`Created ${project.name}`, "Projects", "success");
    return project;
  }

  async function adoptProject(project: Project): Promise<void> {
    setters.setProjects((current) => {
      if (current.some((existing) => existing.id === project.id)) return current;
      return [project, ...current];
    });
    setters.setChatProjects((current) => ({ ...current, [project.id]: project }));
    await selectProject(project.id);
  }

  return {
    adoptProject,
    createProject,
    createFile,
    undoCodeChange,
    loadProjectFilesWithConnection,
    selectFile,
    selectProject,
    ...desktopFolders
  };
}
