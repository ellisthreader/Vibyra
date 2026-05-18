import type { ChatMessage, Project } from "../types/domain";

export const CURRENT_PROJECT_ANALYSIS_VERSION = 2;

export function projectBriefSetupMessageId(projectId: string) {
  return `project-brief-setup-${projectId}`;
}

export function needsFirstOpenDesktopBrief(project: Project, remembered?: Project) {
  if (project.source !== "desktop") return false;
  return !project.brief && !remembered?.brief;
}

export function hasProjectBriefAnalysis(project: Project) {
  return Boolean(project.analysis || project.detectedBrief !== undefined);
}

export function hasFreshProjectBriefAnalysis(project: Project) {
  return Boolean(project.analysis?.analyzerVersion === CURRENT_PROJECT_ANALYSIS_VERSION);
}

export function ensureProjectBriefAnalysis(project: Project): Project {
  if (hasProjectBriefAnalysis(project)) return { ...project, briefRequired: !project.brief };
  return {
    ...project,
    briefRequired: true,
    detectedBrief: null,
    analysis: {
      analyzerVersion: CURRENT_PROJECT_ANALYSIS_VERSION,
      confidence: "low",
      evidence: [],
      filesSampled: 0,
      foldersScanned: 0,
      summary: "I could not finish checking this folder. Choose the project type manually to continue.",
      techEvidence: []
    }
  };
}

export function addProjectBriefSetupToThread(thread: ChatMessage[], project: Project) {
  const id = projectBriefSetupMessageId(project.id);
  if (thread.some((message) => message.id === id)) return thread;
  return [
    ...thread,
    {
      id,
      role: "assistant" as const,
      text: "Analyzing this folder...",
      projectBriefSetup: { projectId: project.id, projectName: project.name, status: "analyzing" as const }
    }
  ];
}

export function updateProjectBriefSetupInThread(thread: ChatMessage[], project: Project) {
  const id = projectBriefSetupMessageId(project.id);
  return thread.map((message) => message.id === id ? {
    ...message,
    text: project.detectedBrief
      ? `I analyzed **${project.name}** and found ${project.detectedBrief.kindLabel} using ${project.detectedBrief.frameworkLabel}.`
      : `I analyzed **${project.name}** but could not confidently identify the project type.`,
    projectBriefSetup: {
      analysis: project.analysis,
      detectedBrief: project.detectedBrief ?? null,
      projectId: project.id,
      projectName: project.name,
      status: "ready" as const
    }
  } : message);
}
