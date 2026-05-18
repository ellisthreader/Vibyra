import { Project } from "../types/domain";
import {
  addProjectBriefSetupToThread,
  updateProjectBriefSetupInThread
} from "./projectBriefSetup";
import { useAppState } from "./useAppState";

export function useProjectBriefChatActions(store: ReturnType<typeof useAppState>) {
  const { setters } = store;

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
      return {
        ...current,
        [project.id]: updateProjectBriefSetupInThread(thread, project)
      };
    });
  }

  return { addProjectBriefSetupMessage, updateProjectBriefSetupMessage };
}
