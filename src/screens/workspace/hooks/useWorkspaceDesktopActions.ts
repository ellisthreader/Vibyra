import { useCallback, useEffect } from "react";
import type { ChatMessage, DesktopConnectionPrompt } from "../../../types/domain";
import { makeId, wait } from "../../../utils/ids";
import { runFirstOpenDesktopAnalysis } from "../helpers/desktopFolderAnalysis";
import type { DesktopCandidate } from "../types";
import { isDetachedChatId } from "./workspaceDetachedChats";
import type { useWorkspaceChatRuntime } from "./workspaceChatRuntime";
import type { WorkspaceState } from "./useWorkspaceState";

export function useWorkspaceDesktopActions(s: WorkspaceState, runtime: ReturnType<typeof useWorkspaceChatRuntime>) {
  const { app } = s;
  const updateConnectionStage = useCallback((messageId: string, stage: NonNullable<DesktopConnectionPrompt["stage"]>, projectId?: string) => {
    const update = { stage };
    if (!projectId && isDetachedChatId(s.selectedChatId)) runtime.updateDetachedMessage(s.selectedChatId!, messageId, (m) => m.desktopConnection ? { ...m, desktopConnection: { ...m.desktopConnection, ...update } } : m);
    else if (!projectId) s.setNewChatMessages((c) => c.map((m) => m.id === messageId && m.desktopConnection ? { ...m, desktopConnection: { ...m.desktopConnection, ...update } } : m));
    else app.updateDesktopConnectionPrompt(messageId, update, projectId);
  }, [app, runtime, s]);
  const rememberDesktopIntent = useCallback((messageId?: string, connectionPrompt?: DesktopConnectionPrompt) => {
    const query = connectionPrompt?.query?.trim() ?? "";
    if (!query || !messageId) return;
    const projectId = connectionPrompt?.projectId ?? sourceProjectId(s);
    const action = connectionPrompt?.reason === "desktop-browse" && projectId ? "analyze-project" : "search";
    updateConnectionStage(messageId, "pair", projectId);
    s.setPendingDesktopFolderIntent({ action, query, detached: !projectId, messageId, ...(projectId ? { projectId } : {}) });
  }, [s, updateConnectionStage]);
  const openPcSwitcher = useCallback((messageId?: string, connectionPrompt?: DesktopConnectionPrompt) => {
    rememberDesktopIntent(messageId, connectionPrompt);
    s.setPcSwitcherVisible(true);
  }, [rememberDesktopIntent, s]);
  const openPcSearch = useCallback(async (messageId?: string, connectionPrompt?: DesktopConnectionPrompt) => {
    rememberDesktopIntent(messageId, connectionPrompt);
    s.setPcSwitcherVisible(true);
    s.setSwitcherScanning(true);
    try { s.setDesktopCandidates(await app.discoverPairableDesktops()); }
    finally { s.setSwitcherScanning(false); }
  }, [app, rememberDesktopIntent, s]);
  const scanDesktops = useCallback(async () => {
    s.setSwitcherScanning(true);
    s.setDesktopCandidates(await app.discoverPairableDesktops());
    s.setSwitcherScanning(false);
  }, [app, s]);
  const connectToDesktop = useCallback(async (d: DesktopCandidate) => { await app.pairMachineAt(d.url, ""); }, [app]);
  const connectWithCode = useCallback(async () => { await app.pairMachine(); }, [app]);
  const confirmPcSwitch = useCallback(() => { app.confirmPhonePermission(); s.setPcSwitcherVisible(false); }, [app, s]);
  const disconnectPc = useCallback(() => { app.disconnectDesktop(); s.setPcSwitcherVisible(false); }, [app, s]);
  const closePcSwitcher = useCallback(() => { s.setPendingDesktopFolderIntent(null); s.setPcSwitcherVisible(false); }, [s]);

  useEffect(() => {
    if (!app.connection || !s.pendingDesktopFolderIntent) return;
    const intent = s.pendingDesktopFolderIntent;
    s.setPendingDesktopFolderIntent(null);
    s.setPcSwitcherVisible(false);
    s.setActivePage("chat");
    if (intent.detached && !isDetachedChatId(s.selectedChatId)) s.setSelectedChatId(null);
    else if (intent.projectId) s.setSelectedChatId(`project-${intent.projectId}`);
    updateConnectionStage(intent.messageId, "open", intent.projectId);
    void (intent.action === "analyze-project" ? analyzeConnectedProject(intent) : replaceConnectionWithFolderProposal(intent));
  }, [app.connection, s, s.pendingDesktopFolderIntent, updateConnectionStage]);

  async function analyzeConnectedProject(intent: NonNullable<WorkspaceState["pendingDesktopFolderIntent"]>) {
    await wait(450);
    const project = intent.projectId ? app.projects.find((item) => item.id === intent.projectId) ?? app.chatProjects[intent.projectId] : null;
    if (!project) { await replaceConnectionWithFolderProposal({ ...intent, action: "search" }); return; }
    replaceConnectionWithReply(intent, `Connected to your PC. Checking the framework and app type for **${project.name}**...`);
    const analyzed = await runFirstOpenDesktopAnalysis(app, project);
    await app.adoptProject(analyzed);
  }

  async function replaceConnectionWithFolderProposal(intent: NonNullable<WorkspaceState["pendingDesktopFolderIntent"]>) {
    await wait(450);
    const matches = await app.searchDesktopFolders(intent.query);
    if (matches.length === 0) {
      replaceConnectionWithReply(intent, `I connected to your PC, but couldn't find a folder matching "${intent.query}". Try the exact folder name, or use Scan Wi-Fi to refresh the desktop connection.`);
      return;
    }
    const top = matches[0];
    const reply = matches.length > 1 ? `I found ${matches.length} folders matching "${intent.query}". Open ${top.name}?` : `Found ${top.name} on your desktop. Open it for this chat?`;
    if (intent.detached) {
      const replace = (m: ChatMessage) => {
        const { desktopConnection: _desktopConnection, ...rest } = m;
        return { ...rest, text: reply, folderProposal: { id: makeId("proposal"), status: "pending" as const, matches, selectedIndex: 0, query: intent.query } };
      };
      if (isDetachedChatId(s.selectedChatId)) runtime.updateDetachedMessage(s.selectedChatId!, intent.messageId, replace);
      else s.setNewChatMessages((c) => c.map((m) => m.id === intent.messageId ? replace(m) : m));
      return;
    }
    app.replaceDesktopConnectionWithProposal(intent.messageId, reply, matches, intent.query, intent.projectId);
  }

  function replaceConnectionWithReply(intent: NonNullable<WorkspaceState["pendingDesktopFolderIntent"]>, reply: string) {
    const replace = (m: ChatMessage) => {
      const { desktopConnection: _desktopConnection, ...rest } = m;
      return { ...rest, text: reply };
    };
    if (intent.detached) {
      if (isDetachedChatId(s.selectedChatId)) runtime.updateDetachedMessage(s.selectedChatId!, intent.messageId, replace);
      else s.setNewChatMessages((c) => c.map((m) => m.id === intent.messageId ? replace(m) : m));
      return;
    }
    app.replaceDesktopConnectionWithProposal(intent.messageId, reply, [], intent.query, intent.projectId);
  }

  return { closePcSwitcher, confirmPcSwitch, connectToDesktop, connectWithCode, disconnectPc, openPcSearch, openPcSwitcher, scanDesktops };
}

function sourceProjectId(s: WorkspaceState) {
  return s.selectedChatId?.startsWith("project-") ? s.selectedChatId.replace("project-", "") : undefined;
}
