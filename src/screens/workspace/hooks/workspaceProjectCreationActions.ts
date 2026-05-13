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
  app.addLocalChatNotice(prompt, project.briefRequired && !project.brief
    ? `Created **${project.name}**. Choose the project setup below, then use **/** when you want Vibyra to build or edit it.`
    : `Created **${project.name}**. Use **/** when you want Vibyra to build or edit it.`, {
    project,
    projectId: project.id,
    chatProjectId: project.id,
    file: null
  });
  app.setTaskText(intent.seedPrompt ?? "");
  return true;
}
