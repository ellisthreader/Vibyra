import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator, Animated, Image, ImageBackground, KeyboardAvoidingView, Linking, Modal,
  NativeScrollEvent, NativeSyntheticEvent, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View
} from "react-native";
import type { ImageStyle, StyleProp, TextStyle, ViewStyle } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import Svg, { Defs, LinearGradient as SvgGradient, Path, Rect, Stop } from "react-native-svg";
import { AppWebView } from "../../../components/AppWebView";
import { VibyraLogo } from "../../../components/VibyraLogo";
import { colors } from "../../../styles/theme";
import type { Agent, ChatMessage, DesktopBrowseEntry, DesktopBrowseListing, FileEntry, GeneratedApp, ModelKey, Project, ReasoningEffort, RememberedDesktop } from "../../../types/domain";
import { appApiRequest, ChatSkill } from "../../../utils/appApi";
import { fetchWithTimeout, normalizeAgentUrl } from "../../../utils/network";
import { aiChatGlyph, chatBuildAiHero, communityHero, dashboardHeroArt, projectsBackdrop, projectsFoldersHero, vibyraLogo } from "../data/assets";
import { chatModelGroups, chatModelOptions, providerLogoSources } from "../data/chatModels";
import { COMMUNITY_COMMENTS_KEY, communityDetailAccent, communityDetailAccentDark, communityPosts } from "../data/community";
import { chatSuggestions, pages, previousChats, projectFilterModes, projectStatuses, tokenMembership } from "../data/pages";
import { styles } from "../styles";
import type { ChatModelOption, ChatModelProvider, CommunityComment, CommunityDetailTab, CommunityFilter, CommunityLogoKind, CommunityPost, CommunityPreviewKind, DashboardPage, DesktopCandidate, ProjectDisplay, ProjectLayout, SettingsTab } from "../types";
import { ChatEmptyState, LowCreditsWarning, MessageBubble, ModelMenuRow, ModelProviderIcon, getUnlockedInitialChatModel, isModelLockedForPlan } from "./index";
import { FolderBrowserModal } from "./FolderBrowserModal";
import { BillingSheet } from "./profile/BillingSheet";

const EFFORT_OPTIONS: { value: ReasoningEffort; label: string; short: string; hint: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { value: "low", label: "Low", short: "Low", hint: "Fast • cheap", icon: "battery-half-outline" },
  { value: "medium", label: "Medium", short: "Med", hint: "Balanced", icon: "flash-outline" },
  { value: "high", label: "High", short: "High", hint: "Deeper reasoning", icon: "sparkles-outline" },
  { value: "xhigh", label: "Extra high", short: "X-Hi", hint: "Maximum reasoning", icon: "rocket-outline" },
];

function effortShortLabel(value: ReasoningEffort): string {
  return EFFORT_OPTIONS.find((o) => o.value === value)?.short ?? "Med";
}

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
  onDismissFolderProposal: (proposalId: string) => void;
  onSearchFolderProposal: (proposalId: string, query: string, excludeProjectId?: string) => void;
  onUndoCodeChange: (projectId: string, messageId: string, changeId: string, file: FileEntry) => Promise<void>;
  onApproveEdits: (messageId: string, projectId: string, alwaysAllow: boolean) => void;
  onDenyEdits: (messageId: string, projectId: string) => Promise<void>;
  onWrongFolderProposal: (proposalId: string, folder: Project, query: string) => void;
  projectName?: string;
  onOpenTokens: () => void;
  onStart: () => void;
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
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const [effortMenuOpen, setEffortMenuOpen] = useState(false);
  const [billingSheetOpen, setBillingSheetOpen] = useState(false);
  const [composerFocused, setComposerFocused] = useState(false);
  const [folderBrowserRecovery, setFolderBrowserRecovery] = useState<NonNullable<ChatMessage["folderRecovery"]> | null>(null);
  const [selectedChatModel, setSelectedChatModel] = useState<string>(() => getUnlockedInitialChatModel(props.selectedModel, props.accountPlan, props.selectedChatModel));
  const hasConversation = props.chatMessages.length > 0;
  const currentModel = chatModelOptions.find((model) => model.key === selectedChatModel) ?? chatModelOptions[0];
  const messageListRef = useRef<ScrollView | null>(null);
  const shouldFollowChatRef = useRef(true);
  const latestMessage = props.chatMessages[props.chatMessages.length - 1];
  const latestMessageKey = latestMessage ? `${latestMessage.id}:${latestMessage.text.length}` : "";

  const scrollToBottom = useCallback((animated = true) => {
    requestAnimationFrame(() => messageListRef.current?.scrollToEnd({ animated }));
    setTimeout(() => messageListRef.current?.scrollToEnd({ animated }), 60);
    setTimeout(() => messageListRef.current?.scrollToEnd({ animated }), 180);
  }, []);

  const followIfAtBottom = useCallback((animated = true) => {
    if (!shouldFollowChatRef.current) return;
    scrollToBottom(animated);
  }, [scrollToBottom]);

  const handleMessageScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    const distanceFromBottom = contentSize.height - layoutMeasurement.height - contentOffset.y;
    shouldFollowChatRef.current = distanceFromBottom < 72;
  }, []);

  useEffect(() => {
    const safeModel = getUnlockedInitialChatModel(props.selectedModel, props.accountPlan, props.selectedChatModel);
    setSelectedChatModel(safeModel);
    if (safeModel !== props.selectedChatModel) {
      props.setSelectedChatModel(safeModel);
    }
  }, [props.accountPlan, props.selectedChatModel, props.selectedModel, props.setSelectedChatModel]);

  useEffect(() => {
    if (!hasConversation) return;
    if (latestMessage?.role === "user") {
      shouldFollowChatRef.current = true;
      scrollToBottom(true);
      return;
    }
    followIfAtBottom(true);
  }, [hasConversation, latestMessage?.role, latestMessageKey, followIfAtBottom, scrollToBottom]);

  function selectModel(model: ChatModelOption) {
    if (isModelLockedForPlan(model, props.accountPlan)) return;
    setSelectedChatModel(model.key);
    props.setSelectedChatModel(model.key);
    if (model.modelKey) props.setSelectedModel(model.modelKey);
    setModelMenuOpen(false);
  }

  const slashMatch = props.taskText.match(/^\/(\w*)$/);
  const filteredSkills = useMemo(() => {
    if (!slashMatch) return [] as ChatSkill[];
    const query = (slashMatch[1] ?? "").toLowerCase();
    if (props.chatSkills.length === 0) return [];
    if (!query) return props.chatSkills;
    return props.chatSkills.filter((skill) =>
      skill.id.toLowerCase().includes(query)
      || skill.label.toLowerCase().includes(query)
      || skill.slash.toLowerCase().includes(`/${query}`)
    );
  }, [props.chatSkills, slashMatch?.[1]]);
  const skillMenuOpen = Boolean(slashMatch) && filteredSkills.length > 0;

  function applySkill(skill: ChatSkill) {
    props.setTaskText(`${skill.slash} `);
  }

  return (
    <View style={[styles.chatPage, styles.chatActivePage]}>
      <View style={styles.chatAssistantPanel}>
        {hasConversation ? (
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
                onDismissFolderProposal={props.onDismissFolderProposal}
                onSearchFolderProposal={props.onSearchFolderProposal}
                onUndoCodeChange={props.onUndoCodeChange}
                onApproveEdits={props.onApproveEdits}
                onDenyEdits={props.onDenyEdits}
                onWrongFolderProposal={props.onWrongFolderProposal}
              />
            ))}
          </ScrollView>
        ) : (
          <ChatEmptyState />
        )}

        <View style={[styles.chatComposerShell, { paddingBottom: Math.max(props.bottomInset, 8) }]}>
          {props.creditsLow ? (
            <LowCreditsWarning
              onOpenTokens={props.onOpenTokens}
              percentRemaining={props.creditPercentRemaining}
            />
          ) : null}
          {modelMenuOpen ? (
            <View style={styles.chatModelMenu}>
              {chatModelGroups.map((group) => (
                <View key={group.title || "auto"} style={styles.chatModelGroup}>
                  {group.title ? <Text style={styles.chatModelGroupTitle}>{group.title}</Text> : null}
                  {group.options.map((model) => (
                    <ModelMenuRow
                      key={model.key}
                      accountPlan={props.accountPlan}
                      model={model}
                      onSelect={selectModel}
                      onUpgrade={() => { setModelMenuOpen(false); setBillingSheetOpen(true); }}
                      selected={selectedChatModel === model.key}
                    />
                  ))}
                </View>
              ))}
            </View>
          ) : null}
          {skillMenuOpen ? (
            <View style={skillMenuStyles.menu}>
              <Text style={skillMenuStyles.heading}>Skills</Text>
              {filteredSkills.map((skill) => (
                <Pressable key={skill.id} onPress={() => applySkill(skill)} style={({ pressed }) => [skillMenuStyles.row, pressed && skillMenuStyles.rowPressed]}>
                  <View style={skillMenuStyles.rowMain}>
                    <Text style={skillMenuStyles.slash}>{skill.slash}</Text>
                    <Text style={skillMenuStyles.label}>{skill.label}</Text>
                  </View>
                  {skill.description ? <Text numberOfLines={1} style={skillMenuStyles.description}>{skill.description}</Text> : null}
                </Pressable>
              ))}
            </View>
          ) : null}
          {effortMenuOpen ? (
            <View style={styles.chatEffortMenu}>
              {EFFORT_OPTIONS.map((option) => {
                const active = props.reasoningEffort === option.value;
                return (
                  <Pressable
                    key={option.value}
                    onPress={() => { props.setReasoningEffort(option.value); setEffortMenuOpen(false); }}
                    style={({ pressed }) => [
                      styles.chatEffortMenuRow,
                      active && styles.chatEffortMenuRowActive,
                      pressed && { opacity: 0.85 }
                    ]}
                  >
                    <Ionicons name={option.icon} color={active ? "#D7C4FF" : "#8F8A9E"} size={16} />
                    <Text style={[styles.chatEffortMenuLabel, active && styles.chatEffortMenuLabelActive]}>{option.label}</Text>
                    <Text style={styles.chatEffortMenuHint}>{option.hint}</Text>
                  </Pressable>
                );
              })}
            </View>
          ) : null}
          <View style={[styles.chatComposer, composerFocused && styles.chatComposerFocused]}>
            <TextInput
              value={props.taskText}
              onChangeText={props.setTaskText}
              placeholder="Ask anything about your project..."
              placeholderTextColor="#8F8A9E"
              multiline
              onFocus={() => setComposerFocused(true)}
              onBlur={() => setComposerFocused(false)}
              style={styles.chatComposerInput}
            />
            <View style={styles.chatComposerBottom}>
              <View style={styles.chatComposerTools}>
                <Pressable style={({ pressed }) => [styles.chatComposerTool, pressed && { opacity: 0.7, transform: [{ scale: 0.95 }] }]}>
                  <Ionicons name="attach-outline" color="#B9B5C8" size={20} />
                </Pressable>
                <Pressable
                  onPress={() => { setEffortMenuOpen((open) => !open); setModelMenuOpen(false); }}
                  style={({ pressed }) => [styles.chatEffortPill, pressed && { opacity: 0.85, transform: [{ scale: 0.97 }] }]}
                >
                  <Ionicons name="flash-outline" color="#D7C4FF" size={14} />
                  <Text style={styles.chatEffortPillLabel}>{effortShortLabel(props.reasoningEffort)}</Text>
                  <Ionicons name={effortMenuOpen ? "chevron-down" : "chevron-up"} color="#9F99B6" size={13} />
                </Pressable>
                <Pressable style={({ pressed }) => [styles.chatModelButton, pressed && { opacity: 0.85 }]} onPress={() => { setModelMenuOpen((open) => !open); setEffortMenuOpen(false); }}>
                  <ModelProviderIcon provider={currentModel.provider} compact />
                  <Text numberOfLines={1} style={styles.chatModelButtonText}>{currentModel.label}</Text>
                  {currentModel.badge ? <Text style={styles.chatModelButtonBadge}>New</Text> : null}
                  {isModelLockedForPlan(currentModel, props.accountPlan) ? <Ionicons name="lock-closed" color="#AAA6BC" size={12} /> : null}
                  <Ionicons name={modelMenuOpen ? "chevron-down" : "chevron-up"} color="#9F99B6" size={13} />
                </Pressable>
              </View>
              <Pressable
                style={({ pressed }) => [styles.chatSendButton, pressed && styles.chatSendButtonPressed]}
                onPress={props.agentRequesting ? undefined : props.onStart}
              >
                <LinearGradient
                  colors={props.agentRequesting ? ["#282B34", "#1A1C25"] : ["#A368FF", "#5D24D8"]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.chatSendGradient}
                >
                  <Ionicons name={props.agentRequesting ? "pause" : "arrow-up"} color={colors.text} size={props.agentRequesting ? 22 : 22} />
                </LinearGradient>
              </Pressable>
            </View>
          </View>
        </View>
      </View>
      <FolderBrowserModal
        browseDesktopPath={props.onBrowseDesktopPath}
        onClose={() => setFolderBrowserRecovery(null)}
        onSelect={(folder) => {
          if (!folderBrowserRecovery) return;
          props.onAcceptFolderProposal(folderBrowserRecovery.proposalId, folder);
          setFolderBrowserRecovery(null);
        }}
        visible={Boolean(folderBrowserRecovery)}
      />
      <BillingSheet visible={billingSheetOpen} onClose={() => setBillingSheetOpen(false)} />
    </View>
  );
}


const skillMenuStyles = StyleSheet.create({
  menu: {
    backgroundColor: "#13131F",
    borderColor: "rgba(176, 132, 255, 0.24)",
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 8,
    padding: 6,
    gap: 2,
    shadowColor: "#8E3CFF",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.22,
    shadowRadius: 18
  },
  heading: {
    color: "#8F8A9E",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1,
    paddingHorizontal: 10,
    paddingTop: 4,
    paddingBottom: 6,
    textTransform: "uppercase"
  },
  row: {
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8
  },
  rowPressed: {
    backgroundColor: "rgba(142, 60, 255, 0.14)"
  },
  rowMain: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10
  },
  slash: {
    color: "#B084FF",
    fontSize: 14,
    fontWeight: "800",
    fontVariant: ["tabular-nums"]
  },
  label: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "700"
  },
  description: {
    color: "#8F8A9E",
    fontSize: 12,
    marginTop: 2
  }
});
