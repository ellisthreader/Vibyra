import React from "react";
import {
  AppPreviewModal, FolderConfirmModal, PcSwitcherSheet, PrimaryMenuSheet,
  RenameChatModal, TokenMembershipSheet
} from "./inline";
import type { useWorkspace } from "./hooks/useWorkspace";
import type { workspaceRecentChats } from "./helpers/chatHeaderActions";

type Props = { openProfile: () => void; recentChats: ReturnType<typeof workspaceRecentChats>; w: ReturnType<typeof useWorkspace> };

export function WorkspaceOverlays({ openProfile, recentChats, w }: Props) {
  const { app, activePage } = w;
  return <>
    <PrimaryMenuSheet
      accountName={app.authName} activePage={activePage} connected={w.isConnected}
      machineName={w.connectedMachineName} onClose={() => w.setPrimaryMenuVisible(false)}
      onConnectPc={() => { w.setPrimaryMenuVisible(false); w.openPcSwitcher(); }}
      onNavigate={(page) => { w.setPrimaryMenuVisible(false); w.navigatePage(page); }}
      onNewChat={() => { w.setPrimaryMenuVisible(false); w.navigatePage("chat"); }}
      onOpenAccountMenu={() => { w.setPrimaryMenuVisible(false); openProfile(); }}
      onOpenProfile={() => { w.setPrimaryMenuVisible(false); openProfile(); }}
      onOpenRecentChat={(chatId) => { w.setPrimaryMenuVisible(false); w.setSelectedChatId(chatId); w.setActivePage("chat"); }}
      profileImageUri={app.profileImageUri} projectCount={app.projects.length} recentChats={recentChats}
      selectedChatId={w.selectedChatId} visible={w.primaryMenuVisible}
    />
    <PcSwitcherSheet
      candidates={w.desktopCandidates} connectedUrl={app.connection?.url}
      connectedMachineName={app.connection?.machineName} currentMachineName={w.connectedMachineName}
      isConnected={w.isConnected} healthMessage={app.healthMessage} manualCode={app.pairCode}
      onClose={w.closePcSwitcher} onCodeChange={app.setPairCode} onConfirm={w.confirmPcSwitch}
      onConnectCandidate={w.connectToDesktop} onConnectManual={w.connectWithCode} onDisconnect={w.disconnectPc}
      onScan={w.scanDesktops} pairing={app.pairing} pairingError={app.pairingError}
      pairingMessage={app.pairingMessage} pendingMachineName={app.pendingPhoneApproval?.machineName}
      scanning={w.switcherScanning || app.checkingHealth} visible={w.pcSwitcherVisible}
    />
    <TokenMembershipSheet
      onClose={() => w.setTokenSheetVisible(false)}
      onManage={() => { w.setTokenSheetVisible(false); w.setActivePage("profile"); w.setSettingsTab("billing"); w.setSettingsTabRequestId((id) => id + 1); }}
      plan={app.accountPlan} tokenBalance={w.tokenBalance} tokensUsed={app.creditsUsed} visible={w.tokenSheetVisible}
    />
    <RenameChatModal draft={w.renameChatDraft} onCancel={() => w.setRenameChatVisible(false)}
      onChangeDraft={w.setRenameChatDraft} onSave={w.saveRenameChat} visible={w.renameChatVisible} />
    <AppPreviewModal app={w.previewApp} onClose={() => w.setPreviewApp(null)} onSubmitAiPrompt={w.submitPreviewEdit} />
    <FolderConfirmModal confirm={w.folderConfirm} onAccept={w.acceptFolderConfirm}
      onCancel={w.cancelFolderConfirm} onSkip={w.skipFolderConfirm} />
  </>;
}
