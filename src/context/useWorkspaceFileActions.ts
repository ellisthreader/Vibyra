import { ChatMessage, FileEntry } from "../types/domain";
import { dedupeFiles } from "../utils/files";
import { impact } from "../utils/haptics";
import { normalizeAgentUrl } from "../utils/network";
import { FileCreateResult } from "./workspaceTypes";
import { WorkspaceLogs, WorkspaceRequests, WorkspaceStore } from "./workspaceActionTypes";

export function useWorkspaceFileActions(store: WorkspaceStore, requests: WorkspaceRequests, logs: WorkspaceLogs) {
  const { state, derived, setters } = store;

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
      markBriefRequired(result.file);
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
            message.id === messageId ? withUndoneChange(message, changeId) : message
          ))
        };
      });
      logs.appendLogs(result.events);
      logs.appendLog(`Undid ${file.path}`, "Code Review", "success");
    } catch (error) {
      logs.appendLog(error instanceof Error ? error.message : "Could not undo file change", "Code Review", "error");
    }
  }

  async function loadProjectFiles(projectId: string, projectPath = ""): Promise<FileEntry[]> {
    if (!state.connection) return [];
    try {
      const pathQuery = projectPath ? `&projectPath=${encodeURIComponent(projectPath)}` : "";
      const result = await requests.agentRequest<{ files: FileEntry[] }>(
        `/files?projectId=${encodeURIComponent(projectId)}${pathQuery}`
      );
      const nextFiles = setLoadedFiles(result.files);
      return hydrateFirstFile(nextFiles, (path) => {
        const endpoint = `/files/read?projectId=${encodeURIComponent(projectId)}&path=${encodeURIComponent(path)}${pathQuery}`;
        return requests.agentRequest<{ file: FileEntry }>(endpoint);
      });
    } catch (error) {
      clearFiles(error instanceof Error ? error.message : "Could not load files");
      return [];
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
    if (fileId !== "empty" && file?.body) markBriefRequired(file);
    if (!file || file.body) return;

    try {
      const endpoint = `/files/read?projectId=${encodeURIComponent(derived.selectedProject.id)}&path=${encodeURIComponent(file.path)}`;
      const result = await requests.agentRequest<{ file: FileEntry }>(endpoint);
      setters.setFiles((current) => current.map((item) => (item.id === fileId ? result.file : item)));
      markBriefRequired(result.file);
    } catch (error) {
      logs.appendLog(error instanceof Error ? error.message : "Could not open file", "Files", "error");
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
  ): Promise<FileEntry[]> {
    const firstFile = files[0];
    if (!firstFile || firstFile.body) return files;

    try {
      const result = await readFile(firstFile.path);
      const hydrated = files.map((item) => (item.id === firstFile.id ? result.file : item));
      setters.setFiles((current) => current.map((item) => (item.id === firstFile.id ? result.file : item)));
      return hydrated;
    } catch (error) {
      logs.appendLog(error instanceof Error ? error.message : "Could not open first file", "Files", "warning");
      return files;
    }
  }

  function clearFiles(message: string) {
    setters.setFiles([]);
    setters.setSelectedFileId("empty");
    logs.appendLog(message, "Files", "error");
  }

  function markBriefRequired(file?: FileEntry | null) {
    const projectId = derived.selectedProject.id;
    if (!projectId) return;
    const selectedFilePath = derived.selectedFile?.id !== "empty" ? derived.selectedFile?.path : "";
    const path = file?.path || selectedFilePath;
    if (!path || path === "No files loaded") return;
    const body = file?.body ?? derived.selectedFile?.body ?? "";
    const project = state.chatProjects[projectId] ?? derived.selectedProject;
    if (!isEmptyFileBody(body, path) || project.briefedFilePaths?.includes(path)) return;
    const mark = (item: typeof derived.selectedProject) => ({ ...item, briefRequired: true, briefRequiredFilePath: path });
    setters.setProjects((current) => current.map((project) => (project.id === projectId ? mark(project) : project)));
    setters.setChatProjects((current) => {
      const existing = current[projectId] ?? derived.selectedProject;
      return { ...current, [projectId]: mark(existing) };
    });
  }

  return { createFile, undoCodeChange, loadProjectFiles, loadProjectFilesWithConnection, selectFile };
}

function isEmptyFileBody(body: string, path: string) {
  const trimmed = body.trim();
  if (!trimmed) return true;
  const name = path.replace(/\\/g, "/").split("/").pop() ?? path;
  return trimmed === `# ${path}` || trimmed === `# ${name}`;
}

function withUndoneChange(message: ChatMessage, changeId: string): ChatMessage {
  return {
    ...message,
    undoneChangeIds: Array.from(new Set([...(message.undoneChangeIds ?? []), changeId]))
  };
}
