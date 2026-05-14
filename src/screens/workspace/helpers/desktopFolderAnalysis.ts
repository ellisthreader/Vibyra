import type { AppContextValue } from "../../../context/appContextTypes";
import type { Project } from "../../../types/domain";

export function needsFirstOpenDesktopAnalysis(app: AppContextValue, project: Project) {
  if (project.source !== "desktop") return false;
  const remembered = app.chatProjects[project.id] ?? app.projects.find((item) => item.id === project.id);
  return !project.brief && !remembered?.brief;
}

export async function runFirstOpenDesktopAnalysis(app: AppContextValue, project: Project): Promise<Project> {
  if (!needsFirstOpenDesktopAnalysis(app, project)) return project;

  app.addProjectBriefSetupMessage(project);
  let analyzed = project;
  try {
    analyzed = await app.analyzeDesktopProject(project);
  } catch {
    analyzed = project;
  }

  const completed = ensureAnalysisResult(analyzed);
  app.updateProjectBriefSetupMessage(completed);
  return completed;
}

function ensureAnalysisResult(project: Project): Project {
  if (project.analysis || project.detectedBrief) return project;
  return {
    ...project,
    briefRequired: true,
    detectedBrief: null,
    analysis: {
      confidence: "low",
      evidence: [],
      filesSampled: 0,
      foldersScanned: 0,
      summary: "I could not finish checking this folder. Choose the project type manually to continue.",
      techEvidence: []
    }
  };
}
