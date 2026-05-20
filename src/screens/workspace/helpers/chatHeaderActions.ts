import { chatCommandHelpReply } from "../data/chatCommands";
import { isDetachedChatId } from "../hooks/workspaceDetachedChats";
import type { useWorkspace } from "../hooks/useWorkspace";
import { makeId } from "../../../utils/ids";

type Workspace = ReturnType<typeof useWorkspace>;

export function workspaceRecentChats(app: Workspace["app"]) {
  const projectRecentChats = Object.entries(app.chatThreads)
    .filter(([, messages]) => messages.length > 0)
    .map(([projectId], index) => ({
      id: `project-${projectId}`,
      title: app.chatTitles[projectId] ?? app.chatProjects[projectId]?.name ?? "Project chat",
      updatedAt: index
    }));
  const detachedRecentChats = Object.entries(app.detachedChatThreads)
    .filter(([, messages]) => messages.length > 0)
    .map(([chatId]) => ({
      id: chatId,
      title: app.detachedChatTitles[chatId] ?? "New chat",
      updatedAt: app.detachedChatUpdatedAt[chatId] ?? 0
    }));
  return [...projectRecentChats, ...detachedRecentChats]
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, 5)
    .map(({ id, title }) => ({ id, title }));
}

export function sendWorkspaceChatHelp(w: Workspace) {
  const { app } = w;
  const projectId = w.selectedChatId?.startsWith("project-") ? w.selectedChatId.replace("project-", "") : "";
  if (projectId) {
    app.addLocalChatReply("/help", chatCommandHelpReply, {
      projectId,
      chatProjectId: projectId,
      project: app.projects.find((p) => p.id === projectId) ?? app.chatProjects[projectId],
      file: null
    });
    return;
  }
  if (isDetachedChatId(w.selectedChatId)) {
    const chatId = w.selectedChatId!;
    app.setDetachedChatThreads((threads) => ({
      ...threads,
      [chatId]: [
        ...(threads[chatId] ?? []),
        { id: makeId("help-user"), role: "user", text: "/help" },
        { id: makeId("help-assistant"), role: "assistant", text: chatCommandHelpReply }
      ]
    }));
    app.setDetachedChatUpdatedAt((current) => ({ ...current, [chatId]: Date.now() }));
    return;
  }
  w.setNewChatMessages((messages) => [
    ...messages,
    { id: `help-user-${Date.now()}`, role: "user", text: "/help" },
    { id: `help-assistant-${Date.now()}`, role: "assistant", text: chatCommandHelpReply }
  ]);
}
