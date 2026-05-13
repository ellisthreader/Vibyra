import { Project } from "../../../types/domain";
import { WorkspaceState } from "./useWorkspaceState";
import { useWorkspaceChatRuntime } from "./workspaceChatRuntime";

type Runtime = ReturnType<typeof useWorkspaceChatRuntime>;

export function handlePublishCommand(
  prompt: string,
  detached: boolean,
  state: WorkspaceState,
  runtime: Runtime,
  reply: (r: string, project?: Project) => void
) {
  if (!/^\/publish\b/i.test(prompt.trim())) return false;
  if (detached) {
    runtime.addDetachedChatReply(prompt, "Open a project chat first, then run `/publish` to customize and publish it.");
    return true;
  }

  const target = runtime.activeProjectTarget();
  state.setPublishProjectId(target.projectId);
  state.setActivePage("projects");
  reply(`Opening publish settings for ${target.project.name}.`, target.project);
  return true;
}
