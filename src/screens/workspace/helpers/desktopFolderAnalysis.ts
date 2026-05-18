import type { AppContextValue } from "../../../context/appContextTypes";
import {
  ensureProjectBriefAnalysis,
  hasFreshProjectBriefAnalysis,
  needsFirstOpenDesktopBrief
} from "../../../context/projectBriefSetup";
import type { Project } from "../../../types/domain";

export function needsFirstOpenDesktopAnalysis(app: AppContextValue, project: Project) {
  const remembered = app.chatProjects[project.id] ?? app.projects.find((item) => item.id === project.id);
  return needsFirstOpenDesktopBrief(project, remembered);
}

export async function runFirstOpenDesktopAnalysis(app: AppContextValue, project: Project): Promise<Project> {
  if (!needsFirstOpenDesktopAnalysis(app, project)) return project;

  app.addProjectBriefSetupMessage(project);
  let analyzed = project;
  if (!hasFreshProjectBriefAnalysis(project)) {
    try {
      analyzed = await app.analyzeDesktopProject(project);
    } catch {
      analyzed = project;
    }
  }

  const completed = ensureProjectBriefAnalysis(analyzed);
  app.updateProjectBriefSetupMessage(completed);
  return completed;
}
