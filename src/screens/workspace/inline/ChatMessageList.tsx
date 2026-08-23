import React from "react";
import { ScrollView } from "react-native";
import type { ChatMessage, Project, ProjectBrief } from "../../../types/domain";
import { styles } from "../styles";
import { ChatToolPlanCard, type ChatToolPlanPreview } from "./ChatToolPlanCard";
import { MessageBubble } from "./MessageBubble";
import { ProjectBriefSetup } from "./ProjectBriefSetup";
import type { AIChatPageProps } from "./AIChatPageTypes";
import type { useChatScrollFollow } from "./useChatScrollFollow";

type MessageActions = Pick<AIChatPageProps,
  "onAcceptFolderProposal" | "onApproveEdits" | "onApprovePreviewServerStart" |
  "onConnectDesktop" | "onDenyEdits" | "onDenyPreviewServerStart" |
  "onDismissFolderProposal" | "onOpenApp" | "onRevertPreviewCode" |
  "onScanForDesktop" | "onSearchFolderProposal" | "onUndoCodeChange" |
  "onWrongFolderProposal" | "projectName">;

type Props = MessageActions & {
  messages: ChatMessage[];
  onBrowseFolderRecovery: (recovery: NonNullable<ChatMessage["folderRecovery"]>) => void;
  onChangeProjectBrief: (projectId: string) => void;
  onConfirmProjectBrief: (projectId: string, brief?: ProjectBrief) => void;
  onSetupComplete: (brief: ProjectBrief) => void;
  project?: Project;
  scroll: ReturnType<typeof useChatScrollFollow>;
  setupFormOpen: boolean;
  setupSubject?: string;
  toolPreview: ChatToolPlanPreview | null;
};

export function ChatMessageList(props: Props) {
  return (
    <ScrollView
      contentContainerStyle={styles.chatMessageListContent}
      keyboardDismissMode="on-drag"
      keyboardShouldPersistTaps="handled"
      onContentSizeChange={() => props.scroll.followIfAtBottom(true)}
      onLayout={() => props.scroll.followIfAtBottom(false)}
      onScroll={props.scroll.handleMessageScroll}
      ref={props.scroll.messageListRef}
      scrollEventThrottle={16}
      showsVerticalScrollIndicator={false}
      style={styles.chatMessageList}
    >
      {props.messages.map((message) => (
        <MessageBubble
          key={message.id} message={message} projectName={props.projectName}
          onOpenApp={props.onOpenApp} onAcceptFolderProposal={props.onAcceptFolderProposal}
          onBrowseFolderRecovery={props.onBrowseFolderRecovery} onChangeProjectBrief={props.onChangeProjectBrief}
          onConfirmProjectBrief={props.onConfirmProjectBrief} onConnectDesktop={props.onConnectDesktop}
          onApprovePreviewServerStart={props.onApprovePreviewServerStart}
          onDenyPreviewServerStart={props.onDenyPreviewServerStart}
          onDismissFolderProposal={props.onDismissFolderProposal} onScanForDesktop={props.onScanForDesktop}
          onSearchFolderProposal={props.onSearchFolderProposal} onUndoCodeChange={props.onUndoCodeChange}
          onRevertPreviewCode={props.onRevertPreviewCode} onApproveEdits={props.onApproveEdits}
          onDenyEdits={props.onDenyEdits} onWrongFolderProposal={props.onWrongFolderProposal}
        />
      ))}
      {props.setupFormOpen ? <ProjectBriefSetup projectName={props.setupSubject} onComplete={props.onSetupComplete} /> : null}
      {props.toolPreview ? <ChatToolPlanCard {...props.toolPreview} /> : null}
    </ScrollView>
  );
}
