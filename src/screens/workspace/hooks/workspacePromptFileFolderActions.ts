import type { GeneratedApp, Project } from "../../../types/domain";
import { extractFileName, isProjectLookupOnly } from "../helpers/chatPrompts";
import { WorkspaceState } from "./useWorkspaceState";
import { useWorkspaceChatRuntime } from "./workspaceChatRuntime";

type Runtime = ReturnType<typeof useWorkspaceChatRuntime>;
type DesktopPromptFn = (prompt: string, query: string, detached: boolean) => void;

export function createWorkspaceFileFolderHandlers(
  s: WorkspaceState,
  runtime: Runtime,
  addDesktopConnectionPrompt: DesktopPromptFn
) {
  const { app } = s;

  async function runFolderSearch(prompt: string, query: string, lookupOnly: boolean, detached: boolean) {
    const reply = replyForPrompt(prompt, detached);
    const matches = await app.searchDesktopFolders(query);
    if (matches.length === 0) {
      reply(`I couldn't find a folder matching "${query}". Try the exact folder name, or open the Projects tab to browse.`);
      return;
    }
    const onTop = matches[0]?.path && matches[0].path === app.selectedProject?.path;
    if (onTop) {
      if (lookupOnly) app.addLocalChatReply(prompt, `${matches[0].name} is already the selected project.`, runtime.activeProjectTarget(matches[0]));
      else await app.startAgent(runtime.activeProjectTarget(matches[0]));
      return;
    }
    if (lookupOnly || detached) {
      const top = matches[0];
      const replyText = matches.length > 1
        ? `I found ${matches.length} folders matching "${query}". Open ${top.name}?`
        : `Found ${top.name} on your desktop. Open it for this chat?`;
      detached
        ? runtime.addDetachedChatProposal(prompt, replyText, matches, query)
        : app.addLocalChatProposal(prompt, replyText, matches, runtime.activeProjectTarget(), query);
      return;
    }
    s.setFolderConfirm({ query: prompt, matches });
  }

  async function runFileOpen(prompt: string, query: string, detached: boolean) {
    const reply = replyForPrompt(prompt, detached);
    if (!app.connection) {
      addDesktopConnectionPrompt(prompt, query, detached);
      return;
    }
    if (detached) {
      reply(`I can open "${query}", but first attach a project chat. Ask me to find the folder on your PC, then open the file from that project.`);
      return;
    }
    const target = runtime.activeProjectTarget();
    const normalized = query.toLowerCase();
    const file = app.files
      .filter((item) => item.id !== "empty" && (item.name.toLowerCase().includes(normalized) || item.path.toLowerCase().includes(normalized)))
      .sort((a, b) => Number(b.name.toLowerCase() === normalized) - Number(a.name.toLowerCase() === normalized))[0];
    if (!file) {
      reply(`I couldn't find a loaded file matching "${query}" in ${target.project.name}. Open the project first, then try the exact file name or path.`);
      return;
    }
    s.setPreviewApp(null);
    await app.selectFile(file.id);
    reply(`Opened ${file.path} in ${target.project.name}.`, target.project);
  }

  function replyForPrompt(prompt: string, detached: boolean) {
    return (reply: string, project?: Project, preview?: GeneratedApp) => detached
      ? runtime.addDetachedChatReply(prompt, reply)
      : app.addLocalChatReply(prompt, reply, runtime.activeProjectTarget(project), preview);
  }

  function extractedFileName(prompt: string) {
    return extractFileName(prompt);
  }

  return { extractedFileName, isProjectLookupOnly, runFileOpen, runFolderSearch };
}
