import React, { useEffect } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, View } from "react-native";
import {
  AIChatPage,
  AccountMenuSheet,
  AppPreviewModal,
  CommunityPage,
  DashboardHome,
  FolderConfirmModal,
  PcSwitcherSheet,
  PrimaryMenuSheet,
  ProfilePage,
  ProjectsPage,
  RenameChatModal,
  TokenMembershipSheet,
  TopBar,
  formatCommunityTitle
} from "./workspace/inline";
import { useWorkspace } from "./workspace/hooks/useWorkspace";
import { directoryForChat } from "./workspace/helpers/chatDirectory";
import { styles } from "./workspace/styles";
import { chatCommandHelpReply } from "./workspace/data/chatCommands";

export function WorkspaceScreen() {
  const w = useWorkspace();
  const { app, activePage, height, insets } = w;
  const chatDirectory = directoryForChat(w.selectedChatId, app);
  const chatHasConversation = w.visibleChatMessages.length > 0;
  const latestRunnablePreview = [...w.visibleChatMessages].reverse().find((message) => message.app)?.app;
  const recentChats = Object.entries(app.chatThreads)
    .filter(([, messages]) => messages.length > 0)
    .slice(-5)
    .reverse()
    .map(([projectId]) => ({
      id: `project-${projectId}`,
      title: app.chatTitles[projectId] ?? app.chatProjects[projectId]?.name ?? "Project chat"
    }));

  useEffect(() => {
    if (!w.previewApp || !latestRunnablePreview || w.previewApp.id === latestRunnablePreview.id) return;
    w.setPreviewApp(latestRunnablePreview);
  }, [latestRunnablePreview, w.previewApp, w.setPreviewApp]);

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.keyboard}>
      <View style={styles.shell}>
        <View style={styles.main}>
          <TopBar
            activePage={activePage}
            chatDirectory={chatDirectory}
            chatHasConversation={chatHasConversation}
            chatStarred={Boolean(w.starredChatKeys[w.chatTitleKey])}
            chatTitle={w.chatTitle}
            communitySubPageTitle={w.selectedCommunityPost ? formatCommunityTitle(w.selectedCommunityPost.title) : ""}
            isConnected={w.isConnected}
            onBackFromCommunity={w.backFromCommunitySubPage}
            onChatHelp={() => {
              const projectId = w.selectedChatId?.startsWith("project-") ? w.selectedChatId.replace("project-", "") : "";
              if (projectId) app.addLocalChatReply("/help", chatCommandHelpReply, { projectId, chatProjectId: projectId, project: app.projects.find((p) => p.id === projectId) ?? app.chatProjects[projectId], file: null });
              else w.setNewChatMessages((messages) => [...messages, { id: `help-user-${Date.now()}`, role: "user", text: "/help" }, { id: `help-assistant-${Date.now()}`, role: "assistant", text: chatCommandHelpReply }]);
            }}
            onDeleteChat={w.deleteCurrentChat}
            onOpenAccount={() => w.setAccountMenuVisible(true)}
            onOpenMenu={() => w.setPrimaryMenuVisible(true)}
            onOpenPreview={() => { void w.openRunnablePreview(); }}
            onRenameChat={w.openRenameChat}
            onToggleStarChat={() => w.setStarredChatKeys((current) => ({ ...current, [w.chatTitleKey]: !current[w.chatTitleKey] }))}
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
                activePage === "dashboard" ? styles.dashboardContent : null,
                activePage === "projects" ? styles.projectsContent : null,
                activePage === "profile" ? styles.profileContent : null,
                { minHeight: Math.max(height - (activePage === "dashboard" ? 190 : 72), 0) }
              ]}
              bounces={activePage === "projects" ? w.projectsCanScroll : activePage !== "dashboard"}
              scrollEnabled={activePage === "projects" ? w.projectsCanScroll : activePage === "community" || activePage === "profile" ? true : activePage !== "dashboard"}
              showsVerticalScrollIndicator={false}
            >
              {activePage === "dashboard" ? (
                <DashboardHome
                  activeAgents={app.activeAgents}
                  onNavigate={w.navigatePage}
                  projects={app.projects}
                />
              ) : null}
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
                  onLevelActivity={app.reportLevelActivity}
                  onOpenApp={(id) => w.setOpenedCommunityPostId(id)}
                  onSelectPost={w.setSelectedCommunityPost}
                  selectedPost={w.selectedCommunityPost}
                />
              ) : null}
              {activePage === "profile" ? (
                <ProfilePage activeTab={w.settingsTab} onTabChange={w.setSettingsTab} />
              ) : null}
            </ScrollView>
          )}
        </View>
        <PrimaryMenuSheet
          activeBuildCount={app.activeAgents.filter((agent) => agent.state === "running" || agent.state === "waiting").length}
          activePage={activePage}
          connected={w.isConnected}
          machineName={w.connectedMachineName}
          onClose={() => w.setPrimaryMenuVisible(false)}
          onConnectPc={() => { w.setPrimaryMenuVisible(false); w.openPcSwitcher(); }}
          onNavigate={(page) => { w.setPrimaryMenuVisible(false); w.navigatePage(page); }}
          onNewChat={() => { w.setPrimaryMenuVisible(false); w.navigatePage("chat"); }}
          onOpenAccount={() => { w.setPrimaryMenuVisible(false); w.setAccountMenuVisible(true); }}
          onOpenRecentChat={(chatId) => { w.setPrimaryMenuVisible(false); w.setSelectedChatId(chatId); w.setActivePage("chat"); }}
          projectCount={app.projects.length}
          recentChats={recentChats}
          visible={w.primaryMenuVisible}
        />
        <AccountMenuSheet
          name={app.authName}
          onClose={() => w.setAccountMenuVisible(false)}
          onOpenTokens={() => { w.setAccountMenuVisible(false); w.setTokenSheetVisible(true); }}
          onTab={(tab) => { w.setAccountMenuVisible(false); w.setSettingsTab(tab); w.setActivePage("profile"); }}
          plan={app.accountPlan}
          tokenBalance={w.tokenBalance}
          visible={w.accountMenuVisible}
        />
        <PcSwitcherSheet
          candidates={w.desktopCandidates}
          connectedUrl={app.connection?.url}
          connectedMachineName={app.connection?.machineName}
          currentMachineName={w.connectedMachineName}
          isConnected={w.isConnected}
          healthMessage={app.healthMessage}
          manualCode={app.pairCode}
          onClose={w.closePcSwitcher}
          onCodeChange={app.setPairCode}
          onConfirm={w.confirmPcSwitch}
          onConnectCandidate={w.connectToDesktop}
          onConnectManual={w.connectWithCode}
          onDisconnect={w.disconnectPc}
          onScan={w.scanDesktops}
          pairing={app.pairing}
          pairingError={app.pairingError}
          pairingMessage={app.pairingMessage}
          pendingMachineName={app.pendingPhoneApproval?.machineName}
          scanning={w.switcherScanning || app.checkingHealth}
          visible={w.pcSwitcherVisible}
        />
        <TokenMembershipSheet
          onClose={() => w.setTokenSheetVisible(false)}
          onManage={() => { w.setTokenSheetVisible(false); w.setActivePage("profile"); w.setSettingsTab("billing"); }}
          plan={app.accountPlan}
          tokenBalance={w.tokenBalance}
          tokensUsed={app.creditsUsed}
          visible={w.tokenSheetVisible}
        />
        <RenameChatModal
          draft={w.renameChatDraft}
          onCancel={() => w.setRenameChatVisible(false)}
          onChangeDraft={w.setRenameChatDraft}
          onSave={w.saveRenameChat}
          visible={w.renameChatVisible}
        />
        <AppPreviewModal app={w.previewApp} onClose={() => w.setPreviewApp(null)} onSubmitAiPrompt={w.submitPreviewEdit} />
        <FolderConfirmModal
          confirm={w.folderConfirm}
          onAccept={w.acceptFolderConfirm}
          onCancel={w.cancelFolderConfirm}
          onSkip={w.skipFolderConfirm}
        />
      </View>
    </KeyboardAvoidingView>
  );
}
