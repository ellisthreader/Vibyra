import { GeneratedApp, PreviewState, Project, FileEntry, LogEvent } from "../types/domain";
import { dedupeFiles, mergeProjects } from "../utils/files";
import { impact } from "../utils/haptics";
import { resolveReachableDesktopPreviewUrl } from "../utils/previewUrls";
import { useDesktopFolders } from "./useDesktopFolders";
import { DesktopRequestError } from "./useRequests";
import { useWorkspaceFileActions } from "./useWorkspaceFileActions";
import { ProjectCreateResult, makeLocalProject } from "./workspaceTypes";
import { WorkspaceLogs, WorkspaceRequests, WorkspaceStore } from "./workspaceActionTypes";

type ProjectOpenOptions = { startPreview?: boolean };
type PreviewServerResult = {
  command: string;
  events: LogEvent[];
  preview: { state: PreviewState; title?: string | null; url?: string | null };
};

export function useWorkspaceActions(store: WorkspaceStore, requests: WorkspaceRequests, logs: WorkspaceLogs) {
  const { state, setters } = store;
  const desktopFolders = useDesktopFolders(Boolean(state.connection), requests, logs);
  const fileActions = useWorkspaceFileActions(store, requests, logs);

  async function createProject(name?: string): Promise<Project | null> {
    impact();
    if (!state.connection) {
      return createLocalProject(name);
    }
    const projectName = name?.trim() || "Untitled Workspace";

    try {
      const result = await requests.agentRequest<ProjectCreateResult>("/projects/create", {
        method: "POST",
        body: JSON.stringify({ name: projectName })
      });
      const project = { ...result.project, briefRequired: true };
      const projects = [project, ...result.projects.filter((item) => item.id !== project.id)];
      const nextFiles = dedupeFiles(result.files);
      setters.setProjects((current) => mergeProjects(current, projects));
      setters.setSelectedProjectId(project.id);
      setters.setChatThreads((current) => ({ ...current, [project.id]: [] }));
      setters.setChatTitles((current) => ({ ...current, [project.id]: project.name }));
      setters.setChatProjects((current) => ({ ...current, [project.id]: project }));
      setters.setFiles(nextFiles);
      setters.setSelectedFileId(nextFiles[0]?.id ?? "empty");
      setters.setPreviewState("live");
      logs.advanceWorkflow(5);
      logs.appendLogs(result.events);
      return project;
    } catch (error) {
      logs.appendLog(error instanceof Error ? error.message : "Project creation failed", "Projects", "error");
      return createLocalProject(projectName);
    }
  }

  async function selectProject(
    projectId: string,
    projectOverrideOrOptions?: Project | ProjectOpenOptions,
    maybeOptions?: ProjectOpenOptions
  ): Promise<FileEntry[]> {
    const projectOverride = isProject(projectOverrideOrOptions) ? projectOverrideOrOptions : undefined;
    const options = isProject(projectOverrideOrOptions) ? maybeOptions : projectOverrideOrOptions;
    const startPreview = options?.startPreview !== false;
    const project = projectOverride ?? state.projects.find((item) => item.id === projectId);
    impact();
    setters.setSelectedProjectId(projectId);
    logs.advanceWorkflow(5);
    if (startPreview) setters.setPreviewState("live");
    logs.appendLogs(startPreview
      ? [
          { source: "Preview", message: `Live preview started for ${project?.name ?? "project"}`, tone: "success" },
          { source: "Projects", message: `Selected ${project?.path ?? "project folder"}`, tone: "info" }
        ]
      : [{ source: "Projects", message: `Opened ${project?.path ?? "project folder"} in chat`, tone: "info" }]);

    if (!state.connection) return [];
    try {
      const files = await fileActions.loadProjectFiles(projectId);
      if (!startPreview) return files;
      const setupProject = projectOverride ?? state.chatProjects[projectId] ?? project;
      if (setupProject?.briefRequired && !setupProject.brief) {
        logs.appendLog(`Choose the project type for ${setupProject.name} before starting preview.`, "Projects", "info");
        return files;
      }
      const result = await requests.agentRequest<{ preview: { state: PreviewState }; events: LogEvent[] }>(
        "/preview/start",
        { method: "POST", body: JSON.stringify({ projectId }) }
      );
      setters.setPreviewState(result.preview.state);
      logs.appendLogs(result.events);
      return files;
    } catch (error) {
      logs.appendLog(error instanceof Error ? error.message : "Preview failed", "Desktop Agent", "error");
      return [];
    }
  }

  function createLocalProject(name?: string) {
    const project = { ...makeLocalProject(name), briefRequired: true };
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

  function rememberProject(project: Project): void {
    setters.setChatProjects((current) => {
      const existing = current[project.id];
      const next = mergeRememberedProject(existing, project);
      if (existing && JSON.stringify(existing) === JSON.stringify(next)) return current;
      return { ...current, [project.id]: next };
    });
  }

  async function adoptProject(project: Project, options: ProjectOpenOptions = { startPreview: false }): Promise<void> {
    const remembered = mergeRememberedProject(state.chatProjects[project.id], project);
    setters.setProjects((current) => {
      if (current.some((existing) => existing.id === project.id)) {
        return current.map((existing) => existing.id === project.id ? mergeRememberedProject(existing, remembered) : existing);
      }
      return [remembered, ...current];
    });
    setters.setChatProjects((current) => ({ ...current, [project.id]: mergeRememberedProject(current[project.id], remembered) }));
    await selectProject(remembered.id, remembered, options);
  }

  async function startPreviewServer(projectId: string, projectName?: string): Promise<GeneratedApp> {
    const connection = state.connection;
    if (!connection) throw new Error("Connect Vibyra Desktop before starting a preview server.");
    const result = await requestPreviewServerStart(projectId);
    setters.setPreviewState(result.preview.state);
    logs.appendLogs(result.events);
    const url = await resolveReachableDesktopPreviewUrl(connection, result.preview.url);
    if (!url) throw new Error("Vibyra Desktop started the preview server, but this phone could not load the preview route or its scripts. Restart Vibyra Desktop, reconnect this phone, then try Preview again.");
    return {
      id: `desktop-dev-preview-${projectId}-${Date.now()}`,
      title: result.preview.title || projectName || "Live preview",
      url
    };
  }

  async function requestPreviewServerStart(projectId: string): Promise<PreviewServerResult> {
    try {
      return await requests.agentRequest<PreviewServerResult>("/preview/start-server", {
        method: "POST",
        body: JSON.stringify({ projectId })
      });
    } catch (error) {
      if (error instanceof DesktopRequestError && error.status === 404 && /unknown vibyra desktop route/i.test(error.message)) {
        throw new Error("Vibyra Desktop is still running an older bridge that cannot start previews from your phone yet. Quit and reopen Vibyra Desktop, reconnect this phone, then try Preview again.");
      }
      throw error;
    }
  }

  return {
    adoptProject,
    rememberProject,
    createProject,
    createFile: fileActions.createFile,
    undoCodeChange: fileActions.undoCodeChange,
    loadProjectFilesWithConnection: fileActions.loadProjectFilesWithConnection,
    selectFile: fileActions.selectFile,
    selectProject,
    startPreviewServer,
    ...desktopFolders
  };
}

function isProject(value: Project | ProjectOpenOptions | undefined): value is Project {
  return Boolean(value && "id" in value);
}

function mergeRememberedProject(existing: Project | undefined, incoming: Project): Project {
  if (!existing) return incoming;
  const savedBrief = existing.brief;
  return {
    ...incoming,
    ...existing,
    name: incoming.name || existing.name,
    path: incoming.path || existing.path,
    source: incoming.source ?? existing.source,
    updated: incoming.updated || existing.updated,
    analysis: incoming.analysis ?? existing.analysis,
    stack: savedBrief ? existing.stack : incoming.stack || existing.stack,
    brief: savedBrief ?? incoming.brief,
    detectedBrief: savedBrief ? (existing.detectedBrief ?? incoming.detectedBrief) : (incoming.detectedBrief ?? existing.detectedBrief),
    briefRequired: savedBrief ? false : (incoming.briefRequired ?? existing.briefRequired),
    briefRequiredFilePath: savedBrief ? undefined : (incoming.briefRequiredFilePath ?? existing.briefRequiredFilePath),
    briefedFilePaths: existing.briefedFilePaths ?? incoming.briefedFilePaths
  };
}
