import { useCallback } from "react";
import { ChatMessage, DesktopConnectionPrompt, GeneratedApp, Project } from "../../../types/domain";
import { streamChatText, TYPING_CURSOR } from "../../../utils/chatStream";
import { findIndexHtmlBody } from "../../../utils/files";
import { hasLocalPreviewDependencies } from "../../../utils/previewHtml";
import { resolveRunnableDesktopPreviewUrl } from "../../../utils/previewUrls";
import { projectPreviewUrl } from "../helpers/chatPrompts";
import { runFirstOpenDesktopAnalysis } from "../helpers/desktopFolderAnalysis";
import { previewAppFromMessage } from "../inline/chatPreviewFallback";
import { WorkspaceState } from "./useWorkspaceState";

export function makeStubProject(id: string): Project {
  return { id, name: id, path: "", stack: "", updated: "" };
}
export function useWorkspaceChatRuntime(s: WorkspaceState) {
  const { app } = s;

  const openProjectChat = useCallback((projectId: string, projectName: string) => {
    const chatId = `project-${projectId}`;
    s.setProjectChatTitles((c) => ({ ...c, [chatId]: app.chatTitles[projectId] ?? projectName }));
    s.setSelectedChatId(chatId);
    s.setActivePage("chat");
  }, [app.chatTitles, s]);

  const addDetachedChatReply = useCallback((prompt: string, reply: string) => {
    const assistantId = `new-chat-assistant-${Date.now()}-${Math.round(Math.random() * 1000)}`;
    s.setNewChatMessages((c) => [
      ...c,
      { id: `new-chat-user-${Date.now()}-${Math.round(Math.random() * 1000)}`, role: "user", text: prompt },
      { id: assistantId, role: "assistant", text: TYPING_CURSOR }
    ]);
    app.setTaskText("");
    streamChatText(reply, (text) => {
      s.setNewChatMessages((c) => c.map((m) => (m.id === assistantId ? { ...m, text } : m)));
    });
  }, [app, s]);

  const addDetachedUserMessage = useCallback((prompt: string) => {
    const trimmed = prompt.trim();
    if (!trimmed) return;
    s.setNewChatMessages((c) => [
      ...c,
      { id: `new-chat-user-${Date.now()}-${Math.round(Math.random() * 1000)}`, role: "user", text: trimmed }
    ]);
    app.setTaskText("");
  }, [app, s]);

  const addDetachedChatProposal = useCallback((prompt: string, reply: string, matches: Project[], query: string) => {
    const proposalId = `new-chat-proposal-${Date.now()}-${Math.round(Math.random() * 1000)}`;
    const assistantId = `new-chat-assistant-${Date.now()}-${Math.round(Math.random() * 1000)}`;
    s.setNewChatMessages((c) => [
      ...c,
      { id: `new-chat-user-${Date.now()}-${Math.round(Math.random() * 1000)}`, role: "user", text: prompt },
      { id: assistantId, role: "assistant", text: TYPING_CURSOR, folderProposal: { id: proposalId, status: "pending", matches, selectedIndex: 0, query } }
    ]);
    app.setTaskText("");
    streamChatText(reply, (text) => {
      s.setNewChatMessages((c) => c.map((m) => (m.id === assistantId ? { ...m, text } : m)));
    });
  }, [app, s]);

  const addDetachedDesktopConnectionPrompt = useCallback((prompt: string, connectionPrompt: DesktopConnectionPrompt) => {
    s.setNewChatMessages((c) => [
      ...c,
      { id: `new-chat-user-${Date.now()}-${Math.round(Math.random() * 1000)}`, role: "user", text: prompt },
      {
        id: `new-chat-assistant-${Date.now()}-${Math.round(Math.random() * 1000)}`,
        role: "assistant",
        text: desktopConnectionReply(connectionPrompt),
        desktopConnection: connectionPrompt
      }
    ]);
    app.setTaskText("");
  }, [app, s]);

  const activeProjectTarget = useCallback((project?: Project) => {
    const selectedChatProjectId = s.selectedChatId?.startsWith("project-") ? s.selectedChatId.replace("project-", "") : null;
    const targetProject = project
      ?? (selectedChatProjectId
        ? (app.projects.find((item) => item.id === selectedChatProjectId)
          ?? app.chatProjects[selectedChatProjectId]
          ?? (app.selectedProject.id === selectedChatProjectId ? app.selectedProject : undefined)
          ?? makeStubProject(selectedChatProjectId))
        : app.selectedProject);
    return {
      project: targetProject,
      projectId: targetProject.id,
      chatProjectId: targetProject.id,
      file: targetProject.id === app.selectedProject.id ? app.selectedFile : null
    };
  }, [app.chatProjects, app.projects, app.selectedFile, app.selectedProject, s.selectedChatId]);

  const desktopPreviewApp = useCallback((projectId: string, projectName: string): GeneratedApp | null => {
    if (!app.connection) return null;
    return { id: `desktop-preview-${projectId}`, title: projectName, url: projectPreviewUrl(app.connection.url, projectId, app.connection.token) };
  }, [app.connection]);

  const showDesktopPreview = useCallback((project: Project) => {
    const preview = desktopPreviewApp(project.id, project.name);
    if (!preview) return false;
    s.setPreviewApp(preview);
    return true;
  }, [desktopPreviewApp, s]);

  const runnablePreviewApp = useCallback(async (): Promise<GeneratedApp | null> => {
    const target = activeProjectTarget();
    const currentThread = s.selectedChatId
      ? (s.selectedChatId.startsWith("project-") ? (app.chatThreads[target.chatProjectId] ?? []) : s.visibleChatMessages)
      : s.newChatMessages;
    const known = app.projects.some((p) => p.id === target.projectId);
    const loadedFiles = known ? await app.selectProject(target.projectId) : [];
    const filesForPreview = loadedFiles.length > 0 ? loadedFiles : app.files;
    const fileHtml = findIndexHtmlBody(filesForPreview);
    const html = fileHtml && !hasLocalPreviewDependencies(fileHtml) ? fileHtml : "";
    const desktopUrl = app.connection && known ? projectPreviewUrl(app.connection.url, target.projectId, app.connection.token) : undefined;
    const resolvedDesktopUrl = desktopUrl ? await resolveRunnableDesktopPreviewUrl(desktopUrl) : null;
    if (resolvedDesktopUrl) {
      return { id: `test-preview-${target.projectId}`, title: target.project.name, url: resolvedDesktopUrl };
    }
    if (html) return {
      id: `test-preview-${target.projectId}`,
      title: target.project.name,
      ...(html ? { html } : {}),
    };

    if (known && app.connection) return null;
    return latestDisplayableApp(currentThread);
  }, [activeProjectTarget, app, s]);

  const openRunnablePreview = useCallback(async () => {
    const preview = await runnablePreviewApp();
    if (!preview) return false;
    s.setPreviewApp(preview);
    return true;
  }, [runnablePreviewApp, s]);

  const openProjectPreview = useCallback(async (projectId: string, projectName: string) => {
    const known = app.projects.some((p) => p.id === projectId);
    const desktopMatch = s.filteredDesktopFolders.find((f) => f.id === projectId);
    const knownProject = app.projects.find((p) => p.id === projectId) ?? desktopMatch ?? app.chatProjects[projectId] ?? makeStubProject(projectId);
    app.rememberProject(knownProject.name === projectName ? knownProject : { ...knownProject, name: projectName });
    openProjectChat(projectId, projectName);
    if (knownProject.source === "desktop" && !app.connection) {
      app.addLocalDesktopConnectionPrompt(`Open ${projectName}`, { projectId, reason: "desktop-browse", query: knownProject.name || projectName }, {
        project: knownProject,
        projectId,
        chatProjectId: projectId,
        file: null
      });
      return;
    }
    if (knownProject.source === "desktop" && !app.chatProjects[projectId]?.brief) {
      const analyzed = await runFirstOpenDesktopAnalysis(app, knownProject);
      await app.adoptProject(analyzed);
      return;
    }

    if (known) await app.selectProject(projectId, { startPreview: false });
  }, [app, openProjectChat, s]);

  const createProjectAndOpenChat = useCallback(async (name?: string) => {
    const project = await app.createProject(name);
    if (project) openProjectChat(project.id, app.chatTitles[project.id] ?? project.name);
  }, [app, openProjectChat]);

  return { activeProjectTarget, addDetachedChatProposal, addDetachedChatReply, addDetachedDesktopConnectionPrompt, addDetachedUserMessage, createProjectAndOpenChat, desktopPreviewApp, openProjectChat, openProjectPreview, openRunnablePreview, runnablePreviewApp, showDesktopPreview };
}
function latestDisplayableApp(...groups: Array<GeneratedApp | null | undefined | Array<Pick<ChatMessage, "app" | "id" | "text">>>) {
  for (const group of groups) {
    if (!group) continue;
    if (!Array.isArray(group)) {
      if (isDisplayableApp(group)) return group;
      continue;
    }
    for (let i = group.length - 1; i >= 0; i -= 1) {
      const message = group[i];
      const app = message?.app ?? (message ? previewAppFromMessage(message.id, message.text) : null);
      if (isDisplayableApp(app)) return app;
    }
  }
  return null;
}

function isDisplayableApp(app: GeneratedApp | null | undefined): app is GeneratedApp {
  return Boolean(app?.html?.trim() || app?.url?.trim());
}

function desktopConnectionReply(connectionPrompt: DesktopConnectionPrompt) {
  if (connectionPrompt.reason === "desktop-agent") {
    return "Connect Vibyra Desktop so I can create a project folder on your PC.";
  }
  if (connectionPrompt.reason === "desktop-browse") {
    return connectionPrompt.query
      ? `Connect Vibyra Desktop so I can open "${connectionPrompt.query}" from your PC.`
      : "Connect Vibyra Desktop so I can open this PC project.";
  }
  return connectionPrompt.query
    ? `Connect Vibyra Desktop so I can search your PC for "${connectionPrompt.query}".`
    : "Connect Vibyra Desktop so I can search and open folders on your PC.";
}
