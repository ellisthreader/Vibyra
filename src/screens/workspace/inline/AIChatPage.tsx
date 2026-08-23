import React, { useCallback, useEffect, useRef, useState } from "react";
import { View } from "react-native";
import type { ChatMessage, ProjectBrief } from "../../../types/domain";
import { useAppContext } from "../../../context/AppContext";
import { hasFreshProjectBriefAnalysis } from "../../../context/projectBriefSetup";
import { runFirstOpenDesktopAnalysis } from "../helpers/desktopFolderAnalysis";
import { styles } from "../styles";
import { ChatEmptyState } from "./ChatModelControls";
import { ChatComposer } from "./ChatComposer";
import type { ChatToolPlanPreview } from "./ChatToolPlanCard";
import { ChatMessageList } from "./ChatMessageList";
import { FolderBrowserModal } from "./FolderBrowserModal";
import type { AIChatPageProps } from "./AIChatPageTypes";
import { confirmedBriefProject, getProjectBriefView } from "./projectBriefView";
import { useChatScrollFollow } from "./useChatScrollFollow";

export function AIChatPage(props: AIChatPageProps) {
  const [folderBrowserRecovery, setFolderBrowserRecovery] = useState<NonNullable<ChatMessage["folderRecovery"]> | null>(null);
  const [commandFolderOpen, setCommandFolderOpen] = useState(false);
  const [toolPreview, setToolPreview] = useState<ChatToolPlanPreview | null>(null);
  const [manualBriefProjectId, setManualBriefProjectId] = useState<string | null>(null);
  const appCtx = useAppContext();
  const hasConversation = props.chatMessages.length > 0 || Boolean(toolPreview);
  const projectId = props.selectedChatId?.startsWith("project-") ? props.selectedChatId.replace("project-", "") : "";
  const composerProjectId = projectId || (appCtx.selectedProject.id !== "no-project" ? appCtx.selectedProject.id : undefined);
  const project = projectId ? (appCtx.projects.find((item) => item.id === projectId) ?? appCtx.chatProjects[projectId]) : undefined;
  const selectedFilePath = appCtx.selectedFile.id !== "empty" ? appCtx.selectedFile.path : "";
  const briefView = getProjectBriefView(projectId, project, selectedFilePath, props.chatMessages,
    manualBriefProjectId, Boolean(appCtx.connection));
  const { needsFileBrief, setupFormOpen, setupRequired, visibleSetupMessages } = briefView;
  const setupSubject = needsFileBrief ? `New file: ${appCtx.selectedFile.name}` : project?.name;
  const chatScroll = useChatScrollFollow(props.chatMessages, hasConversation);
  const staleAnalysisRefreshRef = useRef<Record<string, boolean>>({});

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
    const confirmedProject = target ? confirmedBriefProject(target, brief) : undefined;
    appCtx.saveProjectBrief(confirmProjectId, brief);
    setManualBriefProjectId(null);
    setTimeout(() => appCtx.selectProject(confirmProjectId, confirmedProject), 0);
  }, [appCtx]);

  return (
    <View style={[styles.chatPage, styles.chatActivePage]}>
      <View style={styles.chatAssistantPanel}>
        {hasConversation || setupRequired ? (
          <ChatMessageList
            {...props}
            messages={visibleSetupMessages}
            onBrowseFolderRecovery={setFolderBrowserRecovery}
            onChangeProjectBrief={setManualBriefProjectId}
            onConfirmProjectBrief={confirmProjectBrief}
            onSetupComplete={(brief) => {
              const confirmedProject = project ? confirmedBriefProject(project, brief) : undefined;
              appCtx.saveProjectBrief(projectId, brief);
              setManualBriefProjectId(null);
              setTimeout(() => appCtx.selectProject(projectId, confirmedProject), 0);
            }}
            project={project}
            scroll={chatScroll}
            setupFormOpen={setupFormOpen}
            setupSubject={setupSubject}
            toolPreview={toolPreview}
          />
        ) : (
          <ChatEmptyState onPickSuggestion={props.setTaskText} />
        )}
        {setupRequired ? null : (
          <ChatComposer
            {...props}
            onNewChat={() => { appCtx.clearCurrentChat(); props.setSelectedChatId(null); }}
            onToolPreviewChange={setToolPreview}
            onOpenFolderCommand={() => setCommandFolderOpen(true)}
            projectId={composerProjectId}
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
