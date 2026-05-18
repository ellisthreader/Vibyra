import React, { useCallback, useEffect, useRef, useState } from "react";
import { NativeScrollEvent, NativeSyntheticEvent, ScrollView, View } from "react-native";
import type { ChatStartOptions } from "../../../types/chatTools";
import type { ChatMessage, DesktopBrowseListing, DesktopConnectionPrompt, FileEntry, GeneratedApp, ModelKey, Project, ProjectBrief, ReasoningEffort } from "../../../types/domain";
import { ChatSkill } from "../../../utils/appApi";
import { useAppContext } from "../../../context/AppContext";
import { hasFreshProjectBriefAnalysis } from "../../../context/projectBriefSetup";
import { runFirstOpenDesktopAnalysis } from "../helpers/desktopFolderAnalysis";
import { styles } from "../styles";
import { ChatEmptyState } from "./chunk10";
import { MessageBubble } from "./chunk23";
import { ChatComposer } from "./ChatComposer";
import { FolderBrowserModal } from "./FolderBrowserModal";
import { ProjectBriefSetup } from "./ProjectBriefSetup";

export function AIChatPage(props: {
  accountPlan: string;
  agentRequesting: boolean;
  bottomInset: number;
  chatMessages: ChatMessage[];
  chatSkills: ChatSkill[];
  creditsLow: boolean;
  creditPercentRemaining: number;
  onOpenApp: (app: GeneratedApp) => void;
  onAcceptFolderProposal: (proposalId: string, folder: Project) => void;
  onBrowseDesktopPath: (path?: string) => Promise<DesktopBrowseListing>;
  onConnectDesktop: (messageId: string, prompt: DesktopConnectionPrompt) => void;
  onDismissFolderProposal: (proposalId: string) => void;
  onScanForDesktop: (messageId: string, prompt: DesktopConnectionPrompt) => void;
  onSearchFolderProposal: (proposalId: string, query: string, excludeProjectId?: string) => void;
  onUndoCodeChange: (projectId: string, messageId: string, changeId: string, file: FileEntry) => Promise<void>;
  onRevertPreviewCode: (messageId: string) => void;
  onApproveEdits: (messageId: string, projectId: string, alwaysAllow: boolean) => Promise<void>;
  onDenyEdits: (messageId: string, projectId: string) => Promise<void>;
  onWrongFolderProposal: (proposalId: string, folder: Project, query: string) => void;
  projectName?: string;
  onOpenTokens: () => void;
  onApprovePreviewServerStart: () => void;
  onDenyPreviewServerStart: () => void;
  onStart: (options?: ChatStartOptions) => void;
  onTestPreviewCommand: (userText: string) => void;
  projectChatTitles: Record<string, string>;
  reasoningEffort: ReasoningEffort;
  setReasoningEffort: (effort: ReasoningEffort) => void;
  selectedChatModel: string;
  selectedChatId: string | null;
  selectedFileName: string;
  selectedModel: ModelKey;
  setSelectedChatId: (chatId: string | null) => void;
  setSelectedChatModel: (model: string) => void;
  setSelectedModel: (model: ModelKey) => void;
  setTaskText: (value: string) => void;
  taskText: string;
}) {
  const [folderBrowserRecovery, setFolderBrowserRecovery] = useState<NonNullable<ChatMessage["folderRecovery"]> | null>(null);
  const [commandFolderOpen, setCommandFolderOpen] = useState(false);
  const [manualBriefProjectId, setManualBriefProjectId] = useState<string | null>(null);
  const appCtx = useAppContext();
  const hasConversation = props.chatMessages.length > 0;
  const projectId = props.selectedChatId?.startsWith("project-") ? props.selectedChatId.replace("project-", "") : "";
  const project = projectId ? (appCtx.projects.find((item) => item.id === projectId) ?? appCtx.chatProjects[projectId]) : undefined;
  const selectedFilePath = appCtx.selectedFile.id !== "empty" ? appCtx.selectedFile.path : "";
  const needsFileBrief = Boolean(project?.briefRequiredFilePath && project.briefRequiredFilePath === selectedFilePath);
  const desktopDisconnected = project?.source === "desktop" && !appCtx.connection;
  const confirmedSetup = props.chatMessages.some((message) => message.projectBriefSetup?.projectId === projectId && message.projectBriefSetup.status === "confirmed");
  const setupRequired = Boolean(projectId && !desktopDisconnected && !confirmedSetup && ((project?.briefRequired && !project.brief) || needsFileBrief));
  const hasProjectBriefPrompt = props.chatMessages.some((message) => message.projectBriefSetup?.projectId === projectId);
  const setupFormOpen = setupRequired && (manualBriefProjectId === projectId || !hasProjectBriefPrompt);
  const setupSubject = needsFileBrief ? `New file: ${appCtx.selectedFile.name}` : project?.name;
  const messageListRef = useRef<ScrollView | null>(null);
  const shouldFollowChatRef = useRef(true);
  const staleAnalysisRefreshRef = useRef<Record<string, boolean>>({});
  const latestMessage = props.chatMessages[props.chatMessages.length - 1];
  const latestMessageKey = latestMessage ? `${latestMessage.id}:${latestMessage.text.length}` : "";

  const scrollToBottom = useCallback((animated = true) => {
    requestAnimationFrame(() => messageListRef.current?.scrollToEnd({ animated }));
    setTimeout(() => messageListRef.current?.scrollToEnd({ animated }), 60);
    setTimeout(() => messageListRef.current?.scrollToEnd({ animated }), 180);
  }, []);

  const followIfAtBottom = useCallback((animated = true) => {
    if (shouldFollowChatRef.current) scrollToBottom(animated);
  }, [scrollToBottom]);

  const handleMessageScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    shouldFollowChatRef.current = contentSize.height - layoutMeasurement.height - contentOffset.y < 72;
  }, []);

  useEffect(() => {
    if (!hasConversation) return;
    if (latestMessage?.role === "user") {
      shouldFollowChatRef.current = true;
      scrollToBottom(true);
      return;
    }
    followIfAtBottom(true);
  }, [hasConversation, latestMessage?.role, latestMessageKey, followIfAtBottom, scrollToBottom]);

  useEffect(() => {
    if (!projectId || !project) return;
    if (project.brief || hasFreshProjectBriefAnalysis(project)) { delete staleAnalysisRefreshRef.current[projectId]; return; }
    if (project.source !== "desktop" || staleAnalysisRefreshRef.current[projectId]) return;
    staleAnalysisRefreshRef.current[projectId] = true;
    void appCtx.selectProject(projectId, { startPreview: false });
  }, [appCtx, project, projectId]);
  const confirmProjectBrief = useCallback((confirmProjectId: string, detectedBrief?: ProjectBrief) => {
    const target = appCtx.projects.find((item) => item.id === confirmProjectId) ?? appCtx.chatProjects[confirmProjectId];
    const brief = detectedBrief ?? target?.detectedBrief;
    if (!brief) return;
    appCtx.saveProjectBrief(confirmProjectId, brief);
    setManualBriefProjectId(null);
    setTimeout(() => appCtx.selectProject(confirmProjectId), 0);
  }, [appCtx]);

  return (
    <View style={[styles.chatPage, styles.chatActivePage]}>
      <View style={styles.chatAssistantPanel}>
        {hasConversation || setupRequired ? (
          <ScrollView
            contentContainerStyle={styles.chatMessageListContent}
            keyboardDismissMode="on-drag"
            keyboardShouldPersistTaps="handled"
            onContentSizeChange={() => followIfAtBottom(true)}
            onLayout={() => followIfAtBottom(false)}
            onScroll={handleMessageScroll}
            ref={messageListRef}
            scrollEventThrottle={16}
            showsVerticalScrollIndicator={false}
            style={styles.chatMessageList}
          >
            {props.chatMessages.map((message) => (
              <MessageBubble
                key={message.id}
                message={message}
                projectName={props.projectName}
                onOpenApp={props.onOpenApp}
                onAcceptFolderProposal={props.onAcceptFolderProposal}
                onBrowseFolderRecovery={setFolderBrowserRecovery}
                onChangeProjectBrief={setManualBriefProjectId}
                onConfirmProjectBrief={confirmProjectBrief}
                onConnectDesktop={props.onConnectDesktop}
                onApprovePreviewServerStart={props.onApprovePreviewServerStart}
                onDenyPreviewServerStart={props.onDenyPreviewServerStart}
                onDismissFolderProposal={props.onDismissFolderProposal}
                onScanForDesktop={props.onScanForDesktop}
                onSearchFolderProposal={props.onSearchFolderProposal}
                onUndoCodeChange={props.onUndoCodeChange}
                onRevertPreviewCode={props.onRevertPreviewCode}
                onApproveEdits={props.onApproveEdits}
                onDenyEdits={props.onDenyEdits}
                onWrongFolderProposal={props.onWrongFolderProposal}
              />
            ))}
            {setupFormOpen ? (
              <ProjectBriefSetup
                projectName={setupSubject}
                onComplete={(brief) => { appCtx.saveProjectBrief(projectId, brief); setManualBriefProjectId(null); setTimeout(() => appCtx.selectProject(projectId), 0); }}
              />
            ) : null}
          </ScrollView>
        ) : (
          <ChatEmptyState onPickSuggestion={props.setTaskText} />
        )}
        {setupRequired ? null : (
          <ChatComposer
            {...props}
            onNewChat={() => { appCtx.clearCurrentChat(); props.setSelectedChatId(null); }}
            onOpenFolderCommand={() => setCommandFolderOpen(true)}
          />
        )}
      </View>
      <FolderBrowserModal
        browseDesktopPath={props.onBrowseDesktopPath}
        initialPath={project?.path}
        onClose={() => setFolderBrowserRecovery(null)}
        onSelect={(folder) => {
          if (!folderBrowserRecovery) return;
          props.onAcceptFolderProposal(folderBrowserRecovery.proposalId, folder);
          setFolderBrowserRecovery(null);
        }}
        visible={Boolean(folderBrowserRecovery)}
      />
      <FolderBrowserModal
        browseDesktopPath={props.onBrowseDesktopPath}
        initialPath={project?.path}
        onClose={() => setCommandFolderOpen(false)}
        onSelect={async (folder) => {
          setCommandFolderOpen(false);
          try {
            props.setSelectedChatId(`project-${folder.id}`);
            const analyzed = await runFirstOpenDesktopAnalysis(appCtx, folder);
            await appCtx.adoptProject(analyzed);
            appCtx.addLocalChatReply("/open", `Opened folder **${folder.name}**.`, { project: folder, projectId: folder.id, chatProjectId: folder.id, file: null });
          } catch {
            appCtx.addLocalChatReply("/open", `I couldn't open **${folder.name}**. Check that Vibyra Desktop can still read that folder.`);
          }
        }}
        visible={commandFolderOpen}
      />
    </View>
  );
}
