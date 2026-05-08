import React from "react";
import { KeyboardAvoidingView, Platform, ScrollView, View } from "react-native";
import {
  AIChatPage,
  AppPreviewModal,
  BottomNav,
  CommunityPage,
  DashboardHome,
  FolderConfirmModal,
  PcSwitcherSheet,
  ProfilePage,
  ProjectsPage,
  RenameChatModal,
  TokenMembershipSheet,
  TopBar,
  formatCommunityTitle
} from "./workspace/inline";
import { useWorkspace } from "./workspace/hooks/useWorkspace";
import { styles } from "./workspace/styles";

export function WorkspaceScreen() {
  const w = useWorkspace();
  const { app, activePage, height, insets } = w;

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.keyboard}>
      <View style={styles.shell}>
        <View style={styles.main}>
          <TopBar
            activePage={activePage}
            chatTitle={w.chatTitle}
            compact={w.compact}
            communitySubPageTitle={w.selectedCommunityPost ? formatCommunityTitle(w.selectedCommunityPost.title) : ""}
            isConnected={w.isConnected}
            machineName={w.connectedMachineName}
            onBackFromChat={() => { w.setSelectedChatId(null); w.setActivePage("dashboard"); }}
            onBackFromCommunity={w.backFromCommunitySubPage}
            onDeleteChat={w.deleteCurrentChat}
            onOpenPcSwitcher={w.openPcSwitcher}
            onOpenTokens={() => w.setTokenSheetVisible(true)}
            onRenameChat={w.openRenameChat}
            tokenBalance={w.tokenBalance}
          />
          {activePage === "chat" ? (
            <View style={styles.chatPageHost}>
              <AIChatPage
                bottomInset={insets.bottom}
                onOpenApp={w.setPreviewApp}
                onAcceptFolderProposal={w.acceptFolderProposal}
                onBrowseDesktopPath={app.browseDesktopPath}
                onDismissFolderProposal={w.dismissFolderProposal}
                onSearchFolderProposal={w.searchFolderProposal}
                onWrongFolderProposal={w.wrongFolderProposal}
                agentRequesting={app.agentRequesting}
                chatMessages={w.visibleChatMessages}
                chatSkills={app.chatSkills}
                creditsLow={w.creditsLow}
                creditPercentRemaining={w.creditPercentRemaining}
                onOpenTokens={() => w.setTokenSheetVisible(true)}
                onStart={w.onStartChat}
                selectedChatId={w.selectedChatId}
                projectChatTitles={w.projectChatTitles}
                selectedFileName={app.selectedFile.name}
                selectedChatModel={app.selectedChatModel}
                selectedModel={app.selectedModel}
                accountPlan={app.accountPlan}
                setSelectedChatId={w.setSelectedChatId}
                setSelectedChatModel={app.setSelectedChatModel}
                setSelectedModel={app.setSelectedModel}
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
              bounces={activePage === "projects" ? w.projectsCanScroll : true}
              scrollEnabled={activePage === "projects" ? w.projectsCanScroll : activePage === "community" ? true : activePage !== "dashboard"}
              showsVerticalScrollIndicator={false}
            >
              {activePage === "dashboard" ? (
                <DashboardHome
                  activeAgents={app.activeAgents}
                  machineName={app.connection?.machineName ?? app.machineName}
                  onNavigate={w.navigatePage}
                  projectCount={app.projects.length}
                  projects={app.projects}
                  selectedModel={app.selectedModel}
                  tokenBalance={w.tokenBalance}
                />
              ) : null}
              {activePage === "projects" ? (
                <ProjectsPage
                  connected={Boolean(app.connection)}
                  desktopFolders={w.filteredDesktopFolders}
                  filteredProjects={w.filteredProjects}
                  onCreateProject={w.createProjectAndOpenChat}
                  onOpenProjectPreview={w.openProjectPreview}
                  onSearch={w.setProjectSearch}
                  onScrollNeededChange={w.setProjectsCanScroll}
                  projectSearch={w.projectSearch}
                  selectedProjectId={app.selectedProject.id}
                />
              ) : null}
              {activePage === "community" ? (
                <CommunityPage
                  authToken={app.authToken}
                  currentUserName={app.authName}
                  openedPostId={w.openedCommunityPostId}
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
        {activePage === "chat" ? null : <BottomNav activePage={activePage} onChange={w.navigatePage} />}
        <PcSwitcherSheet
          candidates={w.desktopCandidates}
          connectedUrl={app.connection?.url}
          connectedMachineName={app.connection?.machineName}
          currentMachineName={w.connectedMachineName}
          isConnected={w.isConnected}
          healthMessage={app.healthMessage}
          manualCode={app.pairCode}
          onClose={() => w.setPcSwitcherVisible(false)}
          onCodeChange={app.setPairCode}
          onConfirm={w.confirmPcSwitch}
          onConnectCandidate={w.connectToDesktop}
          onConnectManual={w.connectWithCode}
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
        <AppPreviewModal app={w.previewApp} onClose={() => w.setPreviewApp(null)} />
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
