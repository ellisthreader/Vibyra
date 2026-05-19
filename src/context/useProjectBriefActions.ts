import type { ProjectBrief } from "../types/domain";
import { projectBriefStack, projectBriefTitle } from "../utils/projectBriefs";
import { makeBriefMemoryText } from "../utils/projectMemory";
import { useAppState } from "./useAppState";

export function useProjectBriefActions(store: ReturnType<typeof useAppState>) {
  const { state, derived, setters } = store;

  function saveProjectBrief(projectId: string, brief: ProjectBrief) {
    const title = projectBriefTitle(brief);
    const stack = projectBriefStack(brief);
    const existing = state.projects.find((project) => project.id === projectId) ?? state.chatProjects[projectId];
    const selectedFilePath = derived.selectedFile?.id !== "empty" ? derived.selectedFile?.path : "";
    const filePath = existing?.briefRequiredFilePath || selectedFilePath || "";
    const briefedFilePaths = filePath && filePath !== "No files loaded"
      ? Array.from(new Set([...(existing?.briefedFilePaths ?? []), filePath]))
      : existing?.briefedFilePaths;
    setters.setProjects((current) => current.map((project) => (
      project.id === projectId ? { ...project, stack, brief, briefRequired: false, briefRequiredFilePath: undefined, briefedFilePaths } : project
    )));
    setters.setChatProjects((current) => ({
      ...current,
      [projectId]: {
        ...(existing ?? { id: projectId, name: title, path: "", updated: "Now" }),
        stack,
        brief,
        briefRequired: false,
        briefRequiredFilePath: undefined,
        briefedFilePaths
      }
    }));
    setters.setChatTitles((current) => ({ ...current, [projectId]: title }));
    setters.setProjectMemories((current) => {
      const now = new Date().toISOString();
      const memoryText = makeBriefMemoryText(brief.kindLabel, brief.frameworkLabel, brief.frameworkDescription);
      const existingEntries = current[projectId]?.entries ?? [];
      return {
        ...current,
        [projectId]: {
          entries: [
            { id: `brief-${projectId}`, text: memoryText, source: "brief" as const, createdAt: now },
            ...existingEntries.filter((entry) => entry.source !== "brief")
          ].slice(0, 8),
          updatedAt: now
        }
      };
    });
    setters.setChatThreads((current) => ({
      ...current,
      [projectId]: (current[projectId] ?? []).map((message) => message.id === setupMessageId(projectId) ? {
        ...message,
        text: `Confirmed **${brief.kindLabel}** using **${brief.frameworkLabel}**.`,
        projectBriefSetup: message.projectBriefSetup ? {
          ...message.projectBriefSetup,
          detectedBrief: brief,
          status: "confirmed"
        } : undefined
      } : message)
    }));
  }

  return { saveProjectBrief };
}

function setupMessageId(projectId: string) {
  return `project-brief-setup-${projectId}`;
}
