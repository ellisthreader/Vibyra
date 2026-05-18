import type { Project } from "../types/domain";
import {
  addProjectBriefSetupToThread,
  ensureProjectBriefAnalysis,
  hasFreshProjectBriefAnalysis,
  needsFirstOpenDesktopBrief,
  updateProjectBriefSetupInThread
} from "./projectBriefSetup";
import { WorkspaceStore } from "./workspaceActionTypes";
import { mergeRememberedProject } from "./workspaceProjectMemory";

type DesktopProjectAnalysis = {
  analyzeDesktopProject: (project: Project) => Promise<Project>;
};

export function useFirstOpenProjectBrief(store: WorkspaceStore, desktopFolders: DesktopProjectAnalysis) {
  const { state, setters } = store;

  async function prepareFirstOpenProject(project?: Project): Promise<Project | undefined> {
    if (!project || !state.connection) return project;
    const remembered = state.chatProjects[project.id] ?? state.projects.find((item) => item.id === project.id);
    if (remembered?.brief && !project.brief) return mergeRememberedProject(remembered, project);
    if (!needsFirstOpenDesktopBrief(project, remembered)) return project;
    addProjectBriefSetupMessage(project);
    const analyzed = hasFreshProjectBriefAnalysis(project) ? project : await desktopFolders.analyzeDesktopProject(project);
    const completed = ensureProjectBriefAnalysis(analyzed);
    updateProjectBriefSetupMessage(completed);
    return completed;
  }

  function rememberPreparedProject(project: Project): void {
    setters.setProjects((current) => {
      if (current.some((item) => item.id === project.id)) {
        return current.map((item) => (item.id === project.id ? mergeRememberedProject(item, project) : item));
      }
      return [project, ...current];
    });
    setters.setChatProjects((current) => ({
      ...current,
      [project.id]: mergeRememberedProject(current[project.id], project)
    }));
  }

  function addProjectBriefSetupMessage(project: Project) {
    setters.setChatThreads((current) => {
      const thread = current[project.id] ?? [];
      const nextThread = addProjectBriefSetupToThread(thread, project);
      return nextThread === thread ? current : { ...current, [project.id]: nextThread };
    });
  }

  function updateProjectBriefSetupMessage(project: Project) {
    setters.setChatThreads((current) => {
      const thread = current[project.id] ?? [];
      return { ...current, [project.id]: updateProjectBriefSetupInThread(thread, project) };
    });
  }

  return { prepareFirstOpenProject, rememberPreparedProject };
}
