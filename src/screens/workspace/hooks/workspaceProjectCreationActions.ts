import { projectCreationFailedReply, projectCreationIntent } from "../helpers/projectCreation";
import { WorkspaceState } from "./useWorkspaceState";
import { useWorkspaceChatRuntime } from "./workspaceChatRuntime";

type Runtime = ReturnType<typeof useWorkspaceChatRuntime>;

export async function handleChatProjectCreation(
  prompt: string,
  s: WorkspaceState,
  runtime: Runtime,
  resetFolderState: () => void
) {
  const intent = projectCreationIntent(prompt);
  if (!intent) return false;
  const { app } = s;
  resetFolderState();
  const project = await app.createProject(intent.name);
  if (!project) {
    runtime.addDetachedChatReply(prompt, projectCreationFailedReply());
    return true;
  }
  runtime.openProjectChat(project.id, app.chatTitles[project.id] ?? project.name);
  app.setTaskText(intent.seedPrompt ?? "");
  return true;
}
