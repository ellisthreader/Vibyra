import type { ChatMessage, Project, ProjectBrief } from "../../../types/domain";
import { projectBriefStack } from "../../../utils/projectBriefs";

export function getProjectBriefView(projectId: string, project: Project | undefined, selectedFilePath: string,
  messages: ChatMessage[], manualBriefProjectId: string | null, desktopConnected: boolean) {
  const needsFileBrief = Boolean(project?.briefRequiredFilePath && project.briefRequiredFilePath === selectedFilePath);
  const desktopDisconnected = project?.source === "desktop" && !desktopConnected;
  const confirmedSetup = messages.some((message) =>
    message.projectBriefSetup?.projectId === projectId && message.projectBriefSetup.status === "confirmed");
  const setupRequired = Boolean(projectId && !desktopDisconnected && !confirmedSetup
    && ((project?.briefRequired && !project.brief) || needsFileBrief));
  const hasProjectBriefPrompt = messages.some((message) => message.projectBriefSetup?.projectId === projectId);
  return {
    needsFileBrief,
    setupRequired,
    setupFormOpen: setupRequired && (manualBriefProjectId === projectId || !hasProjectBriefPrompt),
    visibleSetupMessages: manualBriefProjectId === projectId
      ? messages.filter((message) => message.projectBriefSetup?.projectId !== projectId)
      : messages
  };
}

export function confirmedBriefProject(project: Project, brief: ProjectBrief): Project {
  return { ...project, brief, briefRequired: false, briefRequiredFilePath: undefined, stack: projectBriefStack(brief) };
}
