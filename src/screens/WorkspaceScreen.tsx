import React, { useEffect, useMemo } from "react";
import { KeyboardAvoidingView, PanResponder, Platform, ScrollView, View, useWindowDimensions } from "react-native";
import {
  AIChatPage,
  CommunityPage,
  ProfilePage,
  ProjectsPage,
  TopBar
} from "./workspace/inline";
import { useWorkspace } from "./workspace/hooks/useWorkspace";
import { directoryForChat } from "./workspace/helpers/chatDirectory";
import { hasRunnableLoadedFilePreview, isDisplayablePreview } from "./workspace/helpers/previewDisplay";
import { sendWorkspaceChatHelp, workspaceRecentChats } from "./workspace/helpers/chatHeaderActions";
import { styles } from "./workspace/styles";
import { WorkspaceOverlays } from "./workspace/WorkspaceOverlays";

export function WorkspaceScreen() {
  const w = useWorkspace();
  const { app, activePage, height, insets } = w;
  const chatDirectory = directoryForChat(w.selectedChatId, app);
  const chatHasConversation = w.visibleChatMessages.length > 0;
  const latestRunnablePreview = [...w.visibleChatMessages].reverse().find((message) => message.app)?.app;
  const selectedChatProjectId = w.selectedChatId?.startsWith("project-") ? w.selectedChatId.replace("project-", "") : "";
  const selectedChatProject = selectedChatProjectId ? (app.projects.find((project) => project.id === selectedChatProjectId) ?? app.chatProjects[selectedChatProjectId]) : null;
  const chatHasRunnablePreview = isDisplayablePreview(latestRunnablePreview);
  const projectChatHasRunnableFiles = Boolean(selectedChatProjectId && app.selectedProject.id === selectedChatProjectId && hasRunnableLoadedFilePreview(app.files));
  const projectChatCanStartPreview = Boolean(selectedChatProjectId && selectedChatProject && app.connection);
  const recentChats = workspaceRecentChats(app);
  const { width: screenWidth } = useWindowDimensions();

  useEffect(() => {
    if ((app.pairing || app.pendingPhoneApproval) && !w.pcSwitcherVisible) w.openPcSwitcher();
  }, [app.pairing, app.pendingPhoneApproval, w.openPcSwitcher, w.pcSwitcherVisible]);

  const openProfile = () => {
    w.setSettingsTab("profile");
    w.setSettingsTabRequestId((id) => id + 1);
    w.setActivePage("profile");
  };

  // Edge swipe-to-open: from the left edge opens the workspace menu, from the right edge opens the profile page.
  const edgePan = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_e, g) => {
      if (w.primaryMenuVisible) return false;
      const horizontal = Math.abs(g.dx) > Math.abs(g.dy) * 1.4 && Math.abs(g.dx) > 14;
      if (!horizontal) return false;
      if (g.x0 <= 28 && g.dx > 0) return true;
      if (g.x0 >= screenWidth - 28 && g.dx < 0) return true;
      return false;
    },
    onPanResponderRelease: (_e, g) => {
      if (g.x0 <= 28 && g.dx > 0) { w.setPrimaryMenuVisible(true); return; }
      if (g.x0 >= screenWidth - 28 && g.dx < 0) {
        w.setSettingsTab("profile");
        w.setSettingsTabRequestId((id) => id + 1);
        w.setActivePage("profile");
      }
    }
  }), [screenWidth, w.primaryMenuVisible, w.setPrimaryMenuVisible, w.setSettingsTab, w.setSettingsTabRequestId, w.setActivePage]);

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.keyboard}>
      <View style={styles.shell}>
        <View style={styles.main} {...edgePan.panHandlers}>
          <TopBar
            activePage={activePage}
            accountName={app.authName}
            canOpenPreview={chatHasRunnablePreview || projectChatHasRunnableFiles || projectChatCanStartPreview}
            chatDirectory={chatDirectory}
            chatHasConversation={chatHasConversation}
            chatStarred={Boolean(w.starredChatKeys[w.chatTitleKey])}
            chatTitle={w.chatTitle}
            communitySubPageOpen={Boolean(w.selectedCommunityPost)}
            onBackFromCommunity={w.backFromCommunitySubPage}
            onChatHelp={() => sendWorkspaceChatHelp(w)}
            onDeleteChat={w.deleteCurrentChat}
            onOpenAccount={openProfile}
            onOpenMenu={() => w.setPrimaryMenuVisible(true)}
            onOpenPreview={() => { void w.openRunnablePreview("/preview"); }}
            onRenameChat={w.openRenameChat}
            onToggleStarChat={() => w.setStarredChatKeys((current) => ({ ...current, [w.chatTitleKey]: !current[w.chatTitleKey] }))}
            profileImageUri={app.profileImageUri}
          />
          {activePage === "chat" ? (
            <View style={styles.chatPageHost}>
              <AIChatPage
                bottomInset={insets.bottom}
                onOpenApp={w.setPreviewApp}
                onAcceptFolderProposal={w.acceptFolderProposal}
                onBrowseDesktopPath={app.browseDesktopPath}
                onConnectDesktop={w.openPcSwitcher}
                onDismissFolderProposal={w.dismissFolderProposal}
                onScanForDesktop={w.openPcSearch}
                onSearchFolderProposal={w.searchFolderProposal}
                onWrongFolderProposal={w.wrongFolderProposal}
                onUndoCodeChange={app.undoCodeChange}
                onRevertPreviewCode={app.revertPreviewCode}
                onApproveEdits={app.approveEdits}
                onDenyEdits={app.denyEdits}
                projectName={app.selectedProject.name}
                agentRequesting={app.agentRequesting}
                chatMessages={w.visibleChatMessages}
                chatSkills={app.chatSkills}
                creditsLow={w.creditsLow}
                creditPercentRemaining={w.creditPercentRemaining}
                onOpenTokens={() => w.setTokenSheetVisible(true)}
                onOpenPcConnection={() => w.openPcSwitcher()}
                onApprovePreviewServerStart={w.onApprovePreviewServerStart}
                onDenyPreviewServerStart={w.onDenyPreviewServerStart}
                onStart={w.onStartChat}
                onTestPreviewCommand={w.openTestPreview}
                selectedChatId={w.selectedChatId}
                projectChatTitles={w.projectChatTitles}
                selectedFileName={app.selectedFile.name}
                selectedChatModel={app.selectedChatModel}
                selectedModel={app.selectedModel}
                accountPlan={app.accountPlan}
                setSelectedChatId={w.setSelectedChatId}
                setSelectedChatModel={app.setSelectedChatModel}
                setSelectedModel={app.setSelectedModel}
                reasoningEffort={app.reasoningEffort}
                setReasoningEffort={app.setReasoningEffort}
                setTaskText={app.setTaskText}
                taskText={app.taskText}
              />
            </View>
          ) : (
            <ScrollView
              style={styles.contentScroll}
              contentContainerStyle={[
                styles.content,
                activePage === "projects" ? styles.projectsContent : null,
                activePage === "profile" ? styles.profileContent : null,
                { minHeight: Math.max(height - 72, 0) }
              ]}
              bounces={activePage === "projects" ? w.projectsCanScroll : true}
              scrollEnabled={activePage === "projects" ? w.projectsCanScroll : true}
              showsVerticalScrollIndicator={false}
            >
              {activePage === "projects" ? (
                <ProjectsPage
                  connected={Boolean(app.connection)}
                  desktopFolders={w.filteredDesktopFolders}
                  filteredProjects={w.filteredProjects}
                  onCreateProject={w.createProjectAndOpenChat}
                  onOpenProjectPreview={w.openProjectPreview}
                  onPublishRequestHandled={() => w.setPublishProjectId(null)}
                  onSearch={w.setProjectSearch}
                  onScrollNeededChange={w.setProjectsCanScroll}
                  projectSearch={w.projectSearch}
                  publishProjectId={w.publishProjectId}
                  selectedProjectId={app.selectedProject.id}
                />
              ) : null}
              {activePage === "community" ? (
                <CommunityPage
                  authToken={app.authToken}
                  currentUserName={app.authName}
                  openedPostId={w.openedCommunityPostId}
                  onEditOwnPost={(post) => {
                    w.setOpenedCommunityPostId(null);
                    w.setSelectedCommunityPost(null);
                    w.setProjectSearch("");
                    w.setPublishProjectId(post.sourceProjectId ?? null);
                    w.setActivePage("projects");
                  }}
                  onLevelActivity={app.reportLevelActivity}
                  onCloseApp={() => w.setOpenedCommunityPostId(null)}
                  onOpenApp={(id) => w.setOpenedCommunityPostId(id)}
                  onSelectPost={w.setSelectedCommunityPost}
                  selectedPost={w.selectedCommunityPost}
                />
              ) : null}
              {activePage === "profile" ? (
                <ProfilePage activeTab={w.settingsTab} activeTabRequestId={w.settingsTabRequestId} onTabChange={w.setSettingsTab} />
              ) : null}
            </ScrollView>
          )}
        </View>
        <WorkspaceOverlays openProfile={openProfile} recentChats={recentChats} w={w} />
      </View>
    </KeyboardAvoidingView>
  );
}
