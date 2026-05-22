import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Animated, Image, Platform, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { ImageStyle } from "react-native";
import type { ChatMessage, FileEntry, GeneratedApp, Project, ProjectBrief } from "../../../types/domain";
import { isChatUsageLimitText } from "../../../context/chatUsageLimit";
import { normalizeAgentReply } from "../../../utils/files";
import { vibyraLogo } from "../data/assets";
import { chatModelOptionFor, chatModelOptions } from "../data/chatModels";
import { styles } from "../styles";
import { AgentRunProgressText } from "./AgentRunProgressText";
import { LiveCodeActivityCard } from "./LiveCodeActivityCard";
import { RichMessageText } from "./chunk24";
import { AppPreviewCard, TypingIndicator } from "./AppPreviewCards";
import { AppPreviewModal } from "./AppPreviewModal";
import { CodeChangesCard } from "./CodeChangesCard";
import { ChatToolActivityCard } from "./ChatToolActivityCard";
import { ChatImageAttachmentPills } from "./ChatImageAttachmentPills";
import { DesktopConnectionCard } from "./DesktopConnectionCard";
import { EditPermissionCard } from "./EditPermissionCard";
import { FolderProposalCard, FolderRecoveryCard } from "./FolderCards";
import { GeneratedImageCard } from "./GeneratedImageCard";
import { PreviewServerActivityCard } from "./PreviewServerActivityCard";
import { ProjectBriefConfirmationCard } from "./ProjectBriefConfirmationCard";
import { previewAppFromMessage } from "./chatPreviewFallback";
import { ModelProviderIcon } from "./chunk10";

export { AppPreviewCard, AppPreviewModal, TypingIndicator };

export function MessageBubble({ message, projectName, onOpenApp, onAcceptFolderProposal, onBrowseFolderRecovery, onChangeProjectBrief, onConfirmProjectBrief, onConnectDesktop, onApprovePreviewServerStart, onDenyPreviewServerStart, onDismissFolderProposal, onScanForDesktop, onSearchFolderProposal, onUndoCodeChange, onRevertPreviewCode, onWrongFolderProposal, onApproveEdits, onDenyEdits }: {
  message: ChatMessage;
  projectName?: string;
  onOpenApp?: (app: GeneratedApp) => void;
  onAcceptFolderProposal?: (proposalId: string, folder: Project) => void;
  onBrowseFolderRecovery?: (recovery: NonNullable<ChatMessage["folderRecovery"]>) => void;
  onChangeProjectBrief?: (projectId: string) => void;
  onConfirmProjectBrief?: (projectId: string, brief: ProjectBrief) => void;
  onConnectDesktop?: (messageId: string, prompt: NonNullable<ChatMessage["desktopConnection"]>) => void;
  onApprovePreviewServerStart?: () => void;
  onDenyPreviewServerStart?: () => void;
  onDismissFolderProposal?: (proposalId: string) => void;
  onScanForDesktop?: (messageId: string, prompt: NonNullable<ChatMessage["desktopConnection"]>) => void;
  onSearchFolderProposal?: (proposalId: string, query: string, excludeProjectId?: string) => void;
  onUndoCodeChange?: (projectId: string, messageId: string, changeId: string, file: FileEntry) => Promise<void>;
  onRevertPreviewCode?: (messageId: string) => void;
  onWrongFolderProposal?: (proposalId: string, folder: Project, query: string) => void;
  onApproveEdits?: (messageId: string, projectId: string, alwaysAllow: boolean) => Promise<void>;
  onDenyEdits?: (messageId: string, projectId: string) => Promise<void>;
}) {
  const user = message.role === "user";
  const assistantModel = chatModelOptionFor(message.assistantModel) ?? chatModelOptions[0];
  const assistantName = assistantModel.key === "auto" ? "Vibyra" : assistantModel.label;
  const isThinking = !user && message.text === "Working on it...";
  const runningTool = !user && message.runStatus?.status === "running" && message.runStatus.tool;
  const runningToolStatus = runningTool ? message.runStatus : null;
  const visibleText = user ? message.text : normalizeAgentReply(message.text);
  const previewApp = useMemo(() => (
    user ? null : message.app ?? previewAppFromMessage(message.id, visibleText)
  ), [message.app, message.id, user, visibleText]);
  const [editPermissionBusy, setEditPermissionBusy] = useState(false);
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(10)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 280, useNativeDriver: Platform.OS !== "web" }),
      Animated.timing(translateY, { toValue: 0, duration: 360, useNativeDriver: Platform.OS !== "web" })
    ]).start();
  }, [opacity, translateY]);

  const handleApproveEdits = useCallback((alwaysAllow: boolean) => {
    if (!onApproveEdits || !message.codeProjectId) return;
    setEditPermissionBusy(true);
    void onApproveEdits(message.id, message.codeProjectId, alwaysAllow).finally(() => setEditPermissionBusy(false));
  }, [message.codeProjectId, message.id, onApproveEdits]);

  const handleDenyEdits = useCallback(() => {
    if (!onDenyEdits || !message.codeProjectId) return;
    setEditPermissionBusy(true);
    void onDenyEdits(message.id, message.codeProjectId).finally(() => setEditPermissionBusy(false));
  }, [message.codeProjectId, message.id, onDenyEdits]);

  if (!user && message.runStatus?.status === "failed" && isChatUsageLimitText(visibleText)) return null;

  return (
    <Animated.View style={[styles.messageRow, user ? styles.messageRowUser : styles.messageRowAssistant, { opacity, transform: [{ translateY }] }]}>
      <View style={[styles.messageAvatar, user ? styles.messageAvatarUser : styles.messageAvatarAssistant]}>
        {user ? <Ionicons name="person" color="#FFFFFF" size={14} /> : assistantModel.key === "auto" ? (
          <Image resizeMode="contain" source={vibyraLogo} style={styles.messageAvatarLogo as ImageStyle} />
        ) : (
          <ModelProviderIcon provider={assistantModel.provider} />
        )}
      </View>
      <View style={styles.messageContent}>
        <Text style={[styles.messageAuthor, !user && styles.messageAuthorAssistant]}>{user ? "You" : assistantName}</Text>
        {message.file ? <Text numberOfLines={1} style={styles.messageFile}>{message.file}</Text> : null}
        {message.attachments ? (
          <ChatImageAttachmentPills
            fileAttachments={message.attachments.fileAttachments ?? []}
            imageAttachments={message.attachments.imageAttachments ?? []}
            variant="message"
          />
        ) : null}
        {runningToolStatus ? (
          <ChatToolActivityCard status={runningToolStatus} />
        ) : isThinking ? (
          message.runStatus?.status === "running" ? <AgentRunProgressText status={message.runStatus} /> : <TypingIndicator />
        ) : message.previewServer ? (
          <PreviewServerActivityCard previewServer={message.previewServer} onApprove={onApprovePreviewServerStart} onDeny={onDenyPreviewServerStart} />
        ) : <RichMessageText text={visibleText} />}
        {!user && message.generatedImage ? <GeneratedImageCard image={message.generatedImage} /> : null}
        {!user && !runningTool && message.runStatus?.status === "running" && visibleText.trim().length > 0 ? (
          <LiveCodeActivityCard text={visibleText} />
        ) : null}
        {previewApp && onOpenApp ? <AppPreviewCard app={previewApp} onOpen={onOpenApp} /> : null}
        {message.codeChanges?.length && message.editApproval === "pending" && message.codeProjectId ? (
          <EditPermissionCard busy={editPermissionBusy} changes={message.codeChanges} files={message.codeFiles ?? []} projectName={projectName} onAllow={() => handleApproveEdits(false)} onAllowAlways={() => handleApproveEdits(true)} onDeny={handleDenyEdits} />
        ) : null}
        {message.codeChanges?.length && message.editApproval === "denied" ? <EditDeniedCard /> : null}
        {message.codeChanges?.length && message.editApproval === "allowed" ? (
          <CodeChangesCard changes={message.codeChanges} files={message.codeFiles ?? []} messageId={message.id} onPreviewRevert={onRevertPreviewCode} onUndo={onUndoCodeChange} projectId={message.codeProjectId} undoneIds={message.undoneChangeIds ?? []} variant={message.codeProjectId ? "applied" : "preview"} />
        ) : null}
        {message.folderProposal ? <FolderProposalCard proposal={message.folderProposal} onAccept={onAcceptFolderProposal} onDismiss={onDismissFolderProposal} onWrong={onWrongFolderProposal} /> : null}
        {message.folderRecovery ? <FolderRecoveryCard recovery={message.folderRecovery} onBrowse={onBrowseFolderRecovery} onSearch={onSearchFolderProposal} /> : null}
        {message.projectBriefSetup ? <ProjectBriefConfirmationCard setup={message.projectBriefSetup} onChange={onChangeProjectBrief} onConfirm={onConfirmProjectBrief} /> : null}
        {message.desktopConnection ? <DesktopConnectionCard prompt={message.desktopConnection} onConnect={(prompt) => onConnectDesktop?.(message.id, prompt)} onScan={(prompt) => onScanForDesktop?.(message.id, prompt)} /> : null}
      </View>
    </Animated.View>
  );
}

function EditDeniedCard() {
  return (
    <View style={styles.editDeniedCard}>
      <View style={styles.editDeniedIcon}><Ionicons name="shield-outline" color="#D7C4FF" size={15} /></View>
      <View style={styles.editDeniedText}>
        <Text style={styles.editDeniedTitle}>Edits not applied</Text>
        <Text style={styles.editDeniedBody}>Vibyra left the files unchanged.</Text>
      </View>
    </View>
  );
}
