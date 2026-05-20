import { bareNameCandidate, currentProjectReply, isCurrentProjectQuestion } from "../helpers/chatPrompts";
import { folderContentsReply, projectFilesReply } from "../helpers/chatProjectReplies";
import { bareNameClarifyReply, detachedFallbackReply } from "../helpers/chatReplies";
import type { WorkspaceState } from "./useWorkspaceState";
import { useWorkspaceChatRuntime } from "./workspaceChatRuntime";
import { isProjectFilesQuestion } from "./workspacePromptPredicates";

type Runtime = ReturnType<typeof useWorkspaceChatRuntime>;

export function createWorkspacePromptReplyHandlers(
  s: WorkspaceState,
  runtime: Runtime,
  runFolderSearch: (prompt: string, query: string, lookupOnly: boolean, detached: boolean) => Promise<void>,
  promptForDesktopConnection: (prompt: string, query: string, detached: boolean) => void
) {
  const { app } = s;

  function handleProjectQuestion(prompt: string, detached: boolean, reply: (r: string) => void) {
    if (!isCurrentProjectQuestion(prompt)) return false;
    const target = runtime.activeProjectTarget();
    reply(detached ? "This is a new chat with no project attached yet. Open a folder from Projects, or ask me to find a folder on your PC." : currentProjectReply(target.project, target.file?.name ?? "No file selected"));
    return true;
  }

  async function handleProjectFilesQuestion(prompt: string, detached: boolean, reply: (r: string) => void) {
    if (!isProjectFilesQuestion(prompt)) return false;
    if (detached) {
      reply("This is a new chat with no project attached yet. Open a folder first, then ask me what files are inside.");
      return true;
    }
    const target = runtime.activeProjectTarget();
    try {
      const listing = await app.browseDesktopPath(target.project.path);
      reply(folderContentsReply(target.project, listing.entries));
    } catch {
      reply(projectFilesReply(target.project, app.files));
    }
    return true;
  }

  function handleDetachedFallback(prompt: string) {
    const bare = bareNameCandidate(prompt);
    if (!bare) { runtime.addDetachedChatReply(prompt, detachedFallbackReply()); return; }
    if (/^(?:no|nope|nah|not)\b/i.test(prompt) && app.connection) void runFolderSearch(prompt, bare, true, true);
    else if (app.connection) runtime.addDetachedChatReply(prompt, bareNameClarifyReply(bare));
    else promptForDesktopConnection(prompt, bare, true);
  }

  return { handleDetachedFallback, handleProjectFilesQuestion, handleProjectQuestion };
}
