import React from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { LinearGradient } from "expo-linear-gradient";
import { colors } from "../../../styles/theme";
import { styles } from "../styles";
import { LowCreditsWarning } from "./ChatModelControls";
import { ModelMenu, effortShortLabel } from "./ChatComposerMenus";
import { ChatAttachmentSheet } from "./ChatAttachmentSheet";
import { chatToolIcons, chatToolLabels } from "./chatAttachmentTools";
import { ChatImageAttachmentPills } from "./ChatImageAttachmentPills";
import { ChatUsageLimitNotice } from "./ChatUsageLimitNotice";
import { BillingSheet } from "./profile/BillingSheet";
import { SlashCommandMenu } from "./SlashCommandMenu";
import { ProjectMemoryBar } from "./ProjectMemoryBar";
import { PcPermissionControl } from "./PcPermissionControl";
import type { ChatComposerProps } from "./ChatComposerTypes";
import type { useChatComposerController } from "./useChatComposerController";

type Controller = ReturnType<typeof useChatComposerController>;

export function ChatComposerView({ controller, props }: {
  controller: Controller;
  props: ChatComposerProps;
}) {
  const c = controller;
  return (
    <View style={[styles.chatComposerShell, { paddingBottom: Math.max(props.bottomInset, 8) }]}>
      <ChatUsageLimitNotice messages={props.chatMessages} />
      {props.creditsLow ? <LowCreditsWarning onOpenTokens={props.onOpenTokens} percentRemaining={props.creditPercentRemaining} /> : null}
      {c.slashMenuOpen ? (
        <SlashCommandMenu
          commands={c.filteredCommands}
          skills={c.filteredSkills}
          onSelectCommand={(command) => c.runCommand(command, "")}
          onSelectSkill={(skill) => props.setTaskText(`${skill.slash} `)}
        />
      ) : null}
      <ModelMenu
        open={c.modelMenuOpen}
        accountPlan={props.accountPlan}
        selected={c.selectedChatModel}
        reasoningEffort={props.reasoningEffort}
        onSelect={c.selectModel}
        onSelectEffort={props.setReasoningEffort}
        onUpgrade={() => { c.setModelMenuOpen(false); c.setBillingSheetOpen(true); }}
      />
      <View style={[styles.chatComposer, c.composerFocused && styles.chatComposerFocused]}>
        <ChatImageAttachmentPills
          fileAttachments={c.fileAttachments}
          imageAttachments={c.imageAttachments}
          onRemoveFile={(id) => c.setFileAttachments((items) => items.filter((item) => item.id !== id))}
          onRemoveImage={(id) => c.setImageAttachments((items) => items.filter((item) => item.id !== id))}
        />
        <TextInput
          value={props.taskText}
          onChangeText={props.setTaskText}
          placeholder="Type a note, or use / to activate Vibyra..."
          placeholderTextColor={c.placeholderColor}
          multiline
          onFocus={() => c.setComposerFocused(true)}
          onBlur={() => c.setComposerFocused(false)}
          style={styles.chatComposerInput}
        />
        <View style={styles.chatComposerBottom}>
          <View style={styles.chatComposerTools}>
            <Pressable
              accessibilityLabel="Open attachments and tools"
              onPress={c.openAttachmentSheet}
              style={({ pressed }) => [styles.chatComposerTool, pressed && { opacity: 0.7, transform: [{ scale: 0.95 }] }]}
            >
              <Ionicons name="attach-outline" color={c.toolIconColor} size={20} />
            </Pressable>
            <Pressable
              accessibilityLabel="Choose AI model and reasoning effort"
              onPress={() => c.setModelMenuOpen((open) => !open)}
              style={({ pressed }) => [styles.chatModelEffortControl, pressed && { opacity: 0.82 }]}
            >
              {c.inlineTool && c.inlineToolAccent ? (
                <View style={[styles.chatModelToolTag, {
                  backgroundColor: c.inlineToolAccent.backgroundColor,
                  borderColor: c.inlineToolAccent.borderColor,
                }]}>
                  <Ionicons name={chatToolIcons[c.inlineTool]} color={c.inlineToolAccent.iconColor} size={13} />
                  <Text numberOfLines={1} style={[styles.chatModelToolTagText, { color: c.inlineToolAccent.textColor }]}>
                    {chatToolLabels[c.inlineTool]}
                  </Text>
                  <Pressable
                    accessibilityLabel={`Clear ${chatToolLabels[c.inlineTool]}`}
                    hitSlop={8}
                    onPress={c.clearInlineTool}
                    style={({ pressed }) => [styles.chatModelToolTagClear, pressed && { opacity: 0.58 }]}
                  >
                    <Ionicons name="close" color={c.inlineToolAccent.iconColor} size={11} />
                  </Pressable>
                </View>
              ) : (
                <>
                  <Text numberOfLines={1} style={styles.chatModelInlineLabel}>{c.currentModel.label}</Text>
                  <Text style={styles.chatModelInlineDivider}>/</Text>
                  <Text style={styles.chatEffortInlineLabel}>{effortShortLabel(props.reasoningEffort)}</Text>
                </>
              )}
            </Pressable>
          </View>
          <Pressable
            style={({ pressed }) => [styles.chatSendButton, pressed && styles.chatSendButtonPressed]}
            onPress={c.sendLocked ? undefined : c.handleStart}
          >
            <LinearGradient colors={c.sendGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.chatSendGradient}>
              <Ionicons name={c.sendLocked ? "pause" : "arrow-up"} color={colors.text} size={22} />
            </LinearGradient>
          </Pressable>
        </View>
      </View>
      <View style={styles.chatComposerStatusRow}>
        <PcPermissionControl onOpenConnect={props.onOpenPcConnection} projectId={props.projectId} />
        <ProjectMemoryBar chatMessages={props.chatMessages} projectId={props.projectId} taskText={props.taskText} />
      </View>
      <ChatAttachmentSheet
        visible={c.attachmentSheetOpen}
        onClose={() => c.setAttachmentSheetOpen(false)}
        onSelectFileAttachment={(attachment) => {
          c.setFileAttachments((items) => [...items, attachment].slice(-3));
          c.setAttachmentSheetOpen(false);
        }}
        onSelectImageAttachment={(attachment) => {
          c.setImageAttachments((items) => [...items, attachment].slice(-3));
          c.setAttachmentSheetOpen(false);
        }}
        onSelectPrompt={c.selectAttachmentPrompt}
        onSelectTool={c.selectAttachmentTool}
      />
      <BillingSheet visible={c.billingSheetOpen} onClose={() => c.setBillingSheetOpen(false)} />
    </View>
  );
}
