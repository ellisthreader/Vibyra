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
import type { Agent, ChatMessage, DesktopBrowseEntry, DesktopBrowseListing, GeneratedApp, ModelKey, Project, RememberedDesktop } from "../../../types/domain";
import { appApiRequest, ChatSkill } from "../../../utils/appApi";
import { fetchWithTimeout, normalizeAgentUrl } from "../../../utils/network";
import { aiChatGlyph, chatBuildAiHero, communityHero, dashboardHeroArt, projectsBackdrop, projectsFoldersHero, vibyraLogo } from "../data/assets";
import { chatModelGroups, chatModelOptions, providerLogoSources } from "../data/chatModels";
import { COMMUNITY_COMMENTS_KEY, communityDetailAccent, communityDetailAccentDark, communityPosts } from "../data/community";
import { chatSuggestions, pages, previousChats, projectFilterModes, projectStatuses, tokenMembership } from "../data/pages";
import { styles } from "../styles";
import type { ChatModelOption, ChatModelProvider, CommunityComment, CommunityDetailTab, CommunityFilter, CommunityLogoKind, CommunityPost, CommunityPreviewKind, DashboardPage, DesktopCandidate, ProjectDisplay, ProjectLayout, SettingsTab } from "../types";
import { ChatEmptyState, LowCreditsWarning, MessageBubble, ModelMenuRow, ModelProviderIcon, getUnlockedInitialChatModel, isModelLockedForPlan } from "./index";
import { BillingSheet } from "./profile/BillingSheet";

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
  onWrongFolderProposal: (proposalId: string, folder: Project, query: string) => void;
  onOpenTokens: () => void;
  onStart: () => void;
  projectChatTitles: Record<string, string>;
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
  const [billingSheetOpen, setBillingSheetOpen] = useState(false);
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
                onOpenApp={props.onOpenApp}
                onAcceptFolderProposal={props.onAcceptFolderProposal}
                onBrowseFolderRecovery={setFolderBrowserRecovery}
                onDismissFolderProposal={props.onDismissFolderProposal}
                onSearchFolderProposal={props.onSearchFolderProposal}
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
          <View style={styles.chatComposer}>
            <TextInput
              value={props.taskText}
              onChangeText={props.setTaskText}
              placeholder="Ask anything about your project..."
              placeholderTextColor="#8F8A9E"
              multiline
              style={styles.chatComposerInput}
            />
            <View style={styles.chatComposerBottom}>
              <View style={styles.chatComposerTools}>
                <Pressable style={styles.chatComposerTool}>
                  <Ionicons name="attach-outline" color="#B9B5C8" size={24} />
                </Pressable>
                <Pressable style={styles.chatModelButton} onPress={() => setModelMenuOpen((open) => !open)}>
                  <ModelProviderIcon provider={currentModel.provider} compact />
                  <Text numberOfLines={1} style={styles.chatModelButtonText}>{currentModel.label}</Text>
                  {currentModel.badge ? <Text style={styles.chatModelButtonBadge}>New</Text> : null}
                  {isModelLockedForPlan(currentModel, props.accountPlan) ? <Ionicons name="lock-closed" color="#AAA6BC" size={12} /> : null}
                  <Ionicons name={modelMenuOpen ? "chevron-down" : "chevron-up"} color="#AAA6BC" size={15} />
                </Pressable>
              </View>
              <Pressable style={styles.chatSendButton} onPress={props.agentRequesting ? undefined : props.onStart}>
                <LinearGradient
                  colors={props.agentRequesting ? ["#282B34", "#1A1C25"] : ["#8E3CFF", "#5D24D8"]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.chatSendGradient}
                >
                  <Ionicons name={props.agentRequesting ? "pause" : "arrow-up"} color={colors.text} size={props.agentRequesting ? 24 : 28} />
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
        recovery={folderBrowserRecovery}
      />
      <BillingSheet visible={billingSheetOpen} onClose={() => setBillingSheetOpen(false)} />
    </View>
  );
}

function FolderBrowserModal({ browseDesktopPath, onClose, onSelect, recovery }: {
  browseDesktopPath: (path?: string) => Promise<DesktopBrowseListing>;
  onClose: () => void;
  onSelect: (folder: Project) => void;
  recovery: NonNullable<ChatMessage["folderRecovery"]> | null;
}) {
  const [listing, setListing] = useState<DesktopBrowseListing>({ current: null, parentPath: null, entries: [] });
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const visible = Boolean(recovery);

  const openPath = useCallback(async (path?: string) => {
    setLoading(true);
    setError("");
    const next = await browseDesktopPath(path);
    setListing(next);
    setLoading(false);
    if (!next.current && next.entries.length === 0) {
      setError("I couldn't list folders from your PC. Check that Vibyra Desktop is connected.");
    }
  }, [browseDesktopPath]);

  useEffect(() => {
    if (!visible) return;
    setQuery("");
    openPath(undefined);
  }, [openPath, visible]);

  const visibleEntries = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return listing.entries
      .filter((entry) => !needle || entry.name.toLowerCase().includes(needle) || entry.path.toLowerCase().includes(needle));
  }, [listing.entries, query]);

  const projectFromEntry = useCallback((entry: DesktopBrowseEntry): Project => ({
    id: entry.id,
    name: entry.name,
    path: entry.path,
    stack: entry.stack || "Folder",
    updated: entry.updated || "Now",
    source: entry.source ?? "desktop"
  }), []);

  return (
    <Modal animationType="slide" presentationStyle="pageSheet" visible={visible} onRequestClose={onClose}>
      <View style={folderBrowserStyles.screen}>
        <View style={folderBrowserStyles.header}>
          <Pressable onPress={onClose} style={folderBrowserStyles.iconButton}>
            <Ionicons name="close" color="#FFFFFF" size={22} />
          </Pressable>
          <View style={folderBrowserStyles.titleStack}>
            <Text style={folderBrowserStyles.label}>Manual PC browse</Text>
            <Text numberOfLines={1} style={folderBrowserStyles.title}>{listing.current?.name ?? "Choose a location"}</Text>
          </View>
          <Pressable onPress={() => openPath(listing.current?.path)} style={folderBrowserStyles.iconButton}>
            <Ionicons name="refresh" color="#FFFFFF" size={20} />
          </Pressable>
        </View>

        <View style={folderBrowserStyles.pathBar}>
          <Ionicons name="desktop-outline" color="#B084FF" size={15} />
          <Text numberOfLines={1} style={folderBrowserStyles.pathText}>{listing.current?.path ?? "Your PC"}</Text>
        </View>

        <View style={folderBrowserStyles.searchRow}>
          <Ionicons name="search-outline" color="#A29CB8" size={16} />
          <TextInput
            autoCapitalize="none"
            autoCorrect={false}
            onChangeText={setQuery}
            placeholder="Search visible folders"
            placeholderTextColor="#7F788F"
            style={folderBrowserStyles.searchInput}
            value={query}
          />
        </View>

        <View style={folderBrowserStyles.toolbar}>
          <Pressable
            disabled={!listing.parentPath}
            onPress={() => listing.parentPath ? openPath(listing.parentPath) : undefined}
            style={({ pressed }) => [folderBrowserStyles.toolbarButton, !listing.parentPath && folderBrowserStyles.disabled, pressed && folderBrowserStyles.pressed]}
          >
            <Ionicons name="arrow-up" color="#D5D0E6" size={14} />
            <Text style={folderBrowserStyles.toolbarText}>Up</Text>
          </Pressable>
          {listing.current ? (
            <Pressable
              onPress={() => listing.current ? onSelect(listing.current) : undefined}
              style={({ pressed }) => [folderBrowserStyles.selectCurrentButton, pressed && folderBrowserStyles.pressed]}
            >
              <Ionicons name="checkmark" color="#FFFFFF" size={15} />
              <Text style={folderBrowserStyles.selectCurrentText}>Select this folder</Text>
            </Pressable>
          ) : null}
        </View>

        {error ? (
          <View style={folderBrowserStyles.errorBox}>
            <Ionicons name="alert-circle-outline" color="#FFD166" size={15} />
            <Text style={folderBrowserStyles.errorText}>{error}</Text>
          </View>
        ) : null}

        {loading ? (
          <View style={folderBrowserStyles.loading}>
            <ActivityIndicator color="#B084FF" />
            <Text style={folderBrowserStyles.loadingText}>Reading folders...</Text>
          </View>
        ) : (
          <ScrollView contentContainerStyle={folderBrowserStyles.listContent} style={folderBrowserStyles.list}>
            {visibleEntries.map((entry) => {
              const folder = entry.kind === "folder";
              return (
              <View key={entry.id} style={folderBrowserStyles.row}>
                <Pressable
                  disabled={!folder}
                  onPress={() => folder ? openPath(entry.path) : undefined}
                  style={({ pressed }) => [folderBrowserStyles.rowMain, !folder && folderBrowserStyles.fileRow, pressed && folderBrowserStyles.rowPressed]}
                >
                  <View style={folder ? folderBrowserStyles.folderIcon : folderBrowserStyles.fileIcon}>
                    <Ionicons name={folder ? "folder-outline" : "document-outline"} color={folder ? "#B084FF" : "#A29CB8"} size={18} />
                  </View>
                  <View style={folderBrowserStyles.rowText}>
                    <Text numberOfLines={1} style={folderBrowserStyles.rowName}>{entry.name}</Text>
                    <Text numberOfLines={1} style={folderBrowserStyles.rowPath}>{entry.path}</Text>
                  </View>
                  {folder ? <Ionicons name="chevron-forward" color="#8F8A9E" size={16} /> : <Text style={folderBrowserStyles.fileChip}>File</Text>}
                </Pressable>
                {folder ? (
                  <Pressable onPress={() => onSelect(projectFromEntry(entry))} style={({ pressed }) => [folderBrowserStyles.rowSelect, pressed && folderBrowserStyles.pressed]}>
                    <Text style={folderBrowserStyles.rowSelectText}>Select folder</Text>
                  </Pressable>
                ) : null}
              </View>
              );
            })}
            {!visibleEntries.length ? (
              <Text style={folderBrowserStyles.emptyText}>No files or folders are visible here.</Text>
            ) : null}
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}

const folderBrowserStyles = StyleSheet.create({
  screen: {
    backgroundColor: "#0B0C12",
    flex: 1,
    padding: 16,
    paddingTop: 18
  },
  header: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
    marginBottom: 14
  },
  iconButton: {
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 18,
    height: 36,
    justifyContent: "center",
    width: 36
  },
  titleStack: { flex: 1, minWidth: 0 },
  label: { color: "#8F8A9E", fontSize: 11, fontWeight: "900", textTransform: "uppercase" },
  title: { color: colors.text, fontSize: 19, fontWeight: "900", marginTop: 2 },
  pathBar: {
    alignItems: "center",
    backgroundColor: "rgba(176, 132, 255, 0.1)",
    borderColor: "rgba(176, 132, 255, 0.2)",
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: "row",
    gap: 8,
    minHeight: 38,
    paddingHorizontal: 11
  },
  pathText: { color: "#D5D0E6", flex: 1, fontSize: 12, fontWeight: "700" },
  searchRow: {
    alignItems: "center",
    backgroundColor: "#151621",
    borderColor: "rgba(255,255,255,0.09)",
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: "row",
    gap: 8,
    marginTop: 12,
    minHeight: 46,
    paddingHorizontal: 12
  },
  searchInput: { color: colors.text, flex: 1, fontSize: 14, fontWeight: "700", minWidth: 0 },
  toolbar: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
    justifyContent: "space-between",
    marginTop: 12
  },
  toolbarButton: {
    alignItems: "center",
    borderColor: "rgba(255,255,255,0.12)",
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: "row",
    gap: 6,
    minHeight: 36,
    paddingHorizontal: 12
  },
  toolbarText: { color: "#D5D0E6", fontSize: 13, fontWeight: "800" },
  selectCurrentButton: {
    alignItems: "center",
    backgroundColor: "#8E3CFF",
    borderRadius: 999,
    flexDirection: "row",
    gap: 6,
    minHeight: 36,
    paddingHorizontal: 14
  },
  selectCurrentText: { color: "#FFFFFF", fontSize: 13, fontWeight: "900" },
  errorBox: {
    alignItems: "center",
    backgroundColor: "rgba(255, 209, 102, 0.09)",
    borderColor: "rgba(255, 209, 102, 0.22)",
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: "row",
    gap: 8,
    marginTop: 12,
    padding: 10
  },
  errorText: { color: "#FFE1A3", flex: 1, fontSize: 12, fontWeight: "700" },
  loading: { alignItems: "center", flex: 1, gap: 10, justifyContent: "center" },
  loadingText: { color: "#A29CB8", fontSize: 13, fontWeight: "700" },
  list: { flex: 1, marginTop: 12 },
  listContent: { gap: 8, paddingBottom: 24 },
  row: {
    backgroundColor: "#151621",
    borderColor: "rgba(255,255,255,0.08)",
    borderRadius: 12,
    borderWidth: 1,
    overflow: "hidden"
  },
  rowMain: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
    minHeight: 58,
    paddingHorizontal: 11,
    paddingVertical: 9
  },
  rowPressed: { backgroundColor: "rgba(142, 60, 255, 0.1)" },
  folderIcon: {
    alignItems: "center",
    backgroundColor: "rgba(176, 132, 255, 0.14)",
    borderRadius: 10,
    height: 36,
    justifyContent: "center",
    width: 36
  },
  fileIcon: {
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.07)",
    borderRadius: 10,
    height: 36,
    justifyContent: "center",
    width: 36
  },
  fileRow: { opacity: 0.78 },
  fileChip: { color: "#8F8A9E", fontSize: 11, fontWeight: "900" },
  rowText: { flex: 1, minWidth: 0 },
  rowName: { color: colors.text, fontSize: 14, fontWeight: "900" },
  rowPath: { color: "#8F8A9E", fontSize: 11, fontWeight: "700", marginTop: 2 },
  rowSelect: {
    alignItems: "center",
    borderTopColor: "rgba(255,255,255,0.08)",
    borderTopWidth: 1,
    minHeight: 38,
    justifyContent: "center"
  },
  rowSelectText: { color: "#D7C4FF", fontSize: 13, fontWeight: "900" },
  disabled: { opacity: 0.4 },
  pressed: { opacity: 0.82 },
  emptyText: { color: "#8F8A9E", fontSize: 13, fontWeight: "700", padding: 18, textAlign: "center" }
});

const skillMenuStyles = StyleSheet.create({
  menu: {
    backgroundColor: "#171823",
    borderColor: "rgba(255,255,255,0.08)",
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 8,
    padding: 6,
    gap: 2
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
