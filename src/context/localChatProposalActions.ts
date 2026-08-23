import type { Project } from "../types/domain";
import { streamChatText, TYPING_CURSOR } from "../utils/chatStream";
import { makeId } from "../utils/ids";
import type { AgentStartTarget, AppContextValue } from "./appContextTypes";
import type { LocalChatStore, ResolveChatTarget } from "./localChatActionTypes";

export function createLocalChatProposalActions(store: LocalChatStore, resolveTarget: ResolveChatTarget) {
  const { state, setters } = store;
  function addLocalChatProposal(prompt: string, reply: string, matches: Project[], target?: AgentStartTarget, query?: string) {
    const { projectId, file } = resolveTarget(target);
    const proposalId = makeId("proposal");
    const assistantId = makeId("chat-assistant");
    setters.setChatThreads((current) => ({ ...current, [projectId]: [
      ...(current[projectId] ?? []),
      { id: makeId("chat-user"), role: "user", text: prompt, file },
      { id: assistantId, role: "assistant", text: TYPING_CURSOR, file,
        folderProposal: { id: proposalId, status: "pending", matches, selectedIndex: 0, query: query ?? prompt } }
    ] }));
    setters.setTaskText("");
    streamChatText(reply, (text) => setters.setChatThreads((current) => {
      const thread = current[projectId];
      return thread ? { ...current, [projectId]: thread.map((message) => message.id === assistantId ? { ...message, text } : message) } : current;
    }));
    return { proposalProjectId: projectId };
  }

  function addLocalFolderRecovery(prompt: string, reply: string,
    recovery: NonNullable<AppContextValue["chatMessages"][number]["folderRecovery"]>, target?: AgentStartTarget) {
    const { projectId, file } = resolveTarget(target);
    setters.setChatThreads((current) => ({ ...current, [projectId]: [
      ...(current[projectId] ?? []),
      { id: makeId("chat-user"), role: "user", text: prompt, file },
      { id: makeId("chat-assistant"), role: "assistant", text: reply, file, folderRecovery: recovery }
    ] }));
    setters.setTaskText("");
  }

  function updateFolderProposal(proposalId: string,
    update: Partial<NonNullable<AppContextValue["chatMessages"][number]["folderProposal"]>>,
    projectId = state.selectedProjectId) {
    setters.setChatThreads((current) => {
      const thread = current[projectId];
      return thread ? { ...current, [projectId]: thread.map((message) => message.folderProposal?.id === proposalId
        ? { ...message, folderProposal: { ...message.folderProposal, ...update } } : message) } : current;
    });
  }

  return {
    addLocalChatProposal, addLocalFolderRecovery,
    resolveFolderProposal: (proposalId: string, status: "accepted" | "dismissed", projectId?: string) =>
      updateFolderProposal(proposalId, { status }, projectId),
    updateFolderProposal
  };
}
