import { Project } from "../types/domain";
import { useAppState } from "./useAppState";

export function useProjectBriefChatActions(store: ReturnType<typeof useAppState>) {
  const { setters } = store;

  function addProjectBriefSetupMessage(project: Project) {
    const id = setupMessageId(project.id);
    setters.setChatThreads((current) => {
      const thread = current[project.id] ?? [];
      if (thread.some((message) => message.id === id)) return current;
      return {
        ...current,
        [project.id]: [
          ...thread,
          {
            id,
            role: "assistant",
            text: "Analyzing this folder...",
            projectBriefSetup: { projectId: project.id, projectName: project.name, status: "analyzing" }
          }
        ]
      };
    });
  }

  function updateProjectBriefSetupMessage(project: Project) {
    const id = setupMessageId(project.id);
    setters.setChatThreads((current) => {
      const thread = current[project.id] ?? [];
      return {
        ...current,
        [project.id]: thread.map((message) => message.id === id ? {
          ...message,
          text: project.detectedBrief
            ? `I analyzed **${project.name}** and found ${project.detectedBrief.kindLabel} using ${project.detectedBrief.frameworkLabel}.`
            : `I analyzed **${project.name}** but could not confidently identify the project type.`,
          projectBriefSetup: {
            analysis: project.analysis,
            detectedBrief: project.detectedBrief ?? null,
            projectId: project.id,
            projectName: project.name,
            status: "ready"
          }
        } : message)
      };
    });
  }

  return { addProjectBriefSetupMessage, updateProjectBriefSetupMessage };
}

function setupMessageId(projectId: string) {
  return `project-brief-setup-${projectId}`;
}
