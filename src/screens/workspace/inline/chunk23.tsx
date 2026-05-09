import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator, Animated, Image, ImageBackground, KeyboardAvoidingView, Linking, Modal,
  NativeScrollEvent, NativeSyntheticEvent, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { ImageStyle, StyleProp, TextStyle, ViewStyle } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import Svg, { Defs, LinearGradient as SvgGradient, Path, Rect, Stop } from "react-native-svg";
import { AppWebView } from "../../../components/AppWebView";
import { VibyraLogo } from "../../../components/VibyraLogo";
import { colors } from "../../../styles/theme";
import type { Agent, ChatMessage, CodeChange, FileEntry, GeneratedApp, ModelKey, Project, RememberedDesktop } from "../../../types/domain";
import { appApiRequest } from "../../../utils/appApi";
import { fetchWithTimeout, normalizeAgentUrl } from "../../../utils/network";
import { aiChatGlyph, chatBuildAiHero, communityHero, dashboardHeroArt, projectsBackdrop, projectsFoldersHero, vibyraLogo } from "../data/assets";
import { chatModelGroups, chatModelOptions, providerLogoSources } from "../data/chatModels";
import { COMMUNITY_COMMENTS_KEY, communityDetailAccent, communityDetailAccentDark, communityPosts } from "../data/community";
import { chatSuggestions, pages, previousChats, projectFilterModes, projectStatuses, tokenMembership } from "../data/pages";
import { styles } from "../styles";
import type { ChatModelOption, ChatModelProvider, CommunityComment, CommunityDetailTab, CommunityFilter, CommunityLogoKind, CommunityPost, CommunityPreviewKind, DashboardPage, DesktopCandidate, ProjectDisplay, ProjectLayout, SettingsTab } from "../types";
import { RichMessageText } from "./index";

export function MessageBubble({ message, onOpenApp, onAcceptFolderProposal, onBrowseFolderRecovery, onDismissFolderProposal, onSearchFolderProposal, onUndoCodeChange, onWrongFolderProposal }: {
  message: ChatMessage;
  onOpenApp?: (app: GeneratedApp) => void;
  onAcceptFolderProposal?: (proposalId: string, folder: Project) => void;
  onBrowseFolderRecovery?: (recovery: NonNullable<ChatMessage["folderRecovery"]>) => void;
  onDismissFolderProposal?: (proposalId: string) => void;
  onSearchFolderProposal?: (proposalId: string, query: string, excludeProjectId?: string) => void;
  onUndoCodeChange?: (projectId: string, messageId: string, changeId: string, file: FileEntry) => Promise<void>;
  onWrongFolderProposal?: (proposalId: string, folder: Project, query: string) => void;
}) {
  const user = message.role === "user";
  const isThinking = !user && message.text === "Working on it...";
  const [reviewFile, setReviewFile] = useState<FileEntry | null>(null);
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(8)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 260, useNativeDriver: Platform.OS !== "web" }),
      Animated.timing(translateY, { toValue: 0, duration: 320, useNativeDriver: Platform.OS !== "web" })
    ]).start();
  }, [opacity, translateY]);

  return (
    <Animated.View style={[styles.messageRow, user ? styles.messageRowUser : styles.messageRowAssistant, { opacity, transform: [{ translateY }] }]}>
      <View style={[styles.messageAvatar, user ? styles.messageAvatarUser : styles.messageAvatarAssistant]}>
        {user ? (
          <Ionicons name="person" color="#FFFFFF" size={14} />
        ) : (
          <Image resizeMode="contain" source={vibyraLogo} style={styles.messageAvatarLogo as ImageStyle} />
        )}
      </View>
      <View style={styles.messageContent}>
        <Text style={styles.messageAuthor}>{user ? "You" : "Vibyra"}</Text>
        {message.file ? <Text numberOfLines={1} style={styles.messageFile}>{message.file}</Text> : null}
        {isThinking ? (
          <TypingIndicator />
        ) : (
          <RichMessageText text={message.text} />
        )}
        {message.app && onOpenApp ? <AppPreviewCard app={message.app} onOpen={onOpenApp} /> : null}
        {message.codeChanges?.length ? (
          <CodeChangesCard
            changes={message.codeChanges}
            files={message.codeFiles ?? []}
            messageId={message.id}
            onReview={setReviewFile}
            onUndo={onUndoCodeChange}
            projectId={message.codeProjectId}
            undoneIds={message.undoneChangeIds ?? []}
          />
        ) : null}
        {message.folderProposal ? (
          <FolderProposalCard
            proposal={message.folderProposal}
            onAccept={onAcceptFolderProposal}
            onDismiss={onDismissFolderProposal}
            onWrong={onWrongFolderProposal}
          />
        ) : null}
        {message.folderRecovery ? (
          <FolderRecoveryCard recovery={message.folderRecovery} onBrowse={onBrowseFolderRecovery} onSearch={onSearchFolderProposal} />
        ) : null}
        <CodeReviewModal file={reviewFile} onClose={() => setReviewFile(null)} />
      </View>
    </Animated.View>
  );
}

function CodeChangesCard({ changes, files, messageId, onReview, onUndo, projectId, undoneIds }: {
  changes: CodeChange[];
  files: FileEntry[];
  messageId: string;
  onReview: (file: FileEntry) => void;
  onUndo?: (projectId: string, messageId: string, changeId: string, file: FileEntry) => Promise<void>;
  projectId?: string;
  undoneIds: string[];
}) {
  const visibleChanges = changes.filter((change) => !isRunArtifact(change.file));
  if (visibleChanges.length === 0) return null;
  const totalAdditions = visibleChanges.reduce((sum, change) => sum + change.additions, 0);
  const totalDeletions = visibleChanges.reduce((sum, change) => sum + change.deletions, 0);

  return (
    <View style={codeReviewStyles.card}>
      <View style={codeReviewStyles.header}>
        <View>
          <Text style={codeReviewStyles.kicker}>Code changes</Text>
          <Text style={codeReviewStyles.title}>{visibleChanges.length} file{visibleChanges.length === 1 ? "" : "s"} changed</Text>
        </View>
        <Text style={codeReviewStyles.totals}>+{totalAdditions} / -{totalDeletions}</Text>
      </View>
      {visibleChanges.map((change) => {
        const file = files.find((item) => sameFile(item, change));
        const undone = undoneIds.includes(change.id);
        const canUndo = Boolean(projectId && file && file.previousBody !== undefined && file.previousBody !== null && onUndo && !undone);

        return (
          <View key={change.id} style={codeReviewStyles.row}>
            <View style={codeReviewStyles.fileIcon}>
              <Ionicons name={undone ? "return-up-back-outline" : "document-text-outline"} color={undone ? "#FFD166" : "#BFAEFF"} size={16} />
            </View>
            <View style={codeReviewStyles.fileMain}>
              <Text numberOfLines={1} style={codeReviewStyles.fileName}>{fileName(change.file)}</Text>
              <Text style={codeReviewStyles.fileStats}>+{change.additions} / -{change.deletions}{undone ? " · undone" : ""}</Text>
            </View>
            <Pressable disabled={!file} onPress={() => file && onReview(file)} style={({ pressed }) => [codeReviewStyles.actionButton, pressed && file ? codeReviewStyles.actionPressed : null, !file ? codeReviewStyles.actionDisabled : null]}>
              <Text style={codeReviewStyles.actionText}>Review</Text>
            </Pressable>
            <Pressable disabled={!canUndo} onPress={() => projectId && file && onUndo?.(projectId, messageId, change.id, file)} style={({ pressed }) => [codeReviewStyles.iconButton, pressed && canUndo ? codeReviewStyles.actionPressed : null, !canUndo ? codeReviewStyles.actionDisabled : null]}>
              <Ionicons name="arrow-undo-outline" color={canUndo ? "#F3EEFF" : "#777186"} size={15} />
            </Pressable>
          </View>
        );
      })}
    </View>
  );
}

function CodeReviewModal({ file, onClose }: { file: FileEntry | null; onClose: () => void }) {
  if (!file) return null;
  return (
    <Modal animationType="slide" visible transparent onRequestClose={onClose}>
      <View style={codeReviewStyles.modalOverlay}>
        <View style={codeReviewStyles.modalSheet}>
          <View style={codeReviewStyles.modalHeader}>
            <View>
              <Text style={codeReviewStyles.kicker}>Review file</Text>
              <Text numberOfLines={1} style={codeReviewStyles.modalTitle}>{file.name}</Text>
            </View>
            <Pressable onPress={onClose} style={codeReviewStyles.closeButton}>
              <Ionicons name="close" color="#F6F2FF" size={20} />
            </Pressable>
          </View>
          <ScrollView style={codeReviewStyles.codeScroll} contentContainerStyle={codeReviewStyles.codeContent}>
            <Text selectable style={codeReviewStyles.codeText}>{file.body || "(empty file)"}</Text>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function fileName(path: string) {
  return path.replace(/\\/g, "/").split("/").filter(Boolean).pop() ?? path;
}

function isRunArtifact(path: string) {
  return path.includes(".vibyra-agent/runs/");
}

function sameFile(file: FileEntry, change: CodeChange) {
  return file.path === change.file || file.name === fileName(change.file) || change.file.endsWith(`/${file.path}`);
}

function FolderProposalCard({ proposal, onAccept, onDismiss, onWrong }: {
  proposal: NonNullable<ChatMessage["folderProposal"]>;
  onAccept?: (proposalId: string, folder: Project) => void;
  onDismiss?: (proposalId: string) => void;
  onWrong?: (proposalId: string, folder: Project, query: string) => void;
}) {
  const folder = proposal.matches[proposal.selectedIndex] ?? proposal.matches[0];
  if (!folder) return null;
  const resolved = proposal.status !== "pending";
  const accepted = proposal.status === "accepted";
  const query = proposal.query ?? folder.name;

  return (
    <View style={folderProposalStyles.card}>
      <View style={folderProposalStyles.kickerRow}>
        <View style={folderProposalStyles.kickerPill}>
          <Ionicons name="sparkles-outline" color="#D7C4FF" size={12} />
          <Text style={folderProposalStyles.kickerText}>Desktop match</Text>
        </View>
        <Text style={folderProposalStyles.matchCount}>
          {proposal.matches.length > 1 ? `${proposal.selectedIndex + 1} of ${proposal.matches.length}` : "Best match"}
        </Text>
      </View>
      <View style={folderProposalStyles.header}>
        <View style={folderProposalStyles.icon}>
          <Ionicons name="folder-open-outline" color="#B084FF" size={18} />
        </View>
        <View style={folderProposalStyles.headerText}>
          <Text numberOfLines={1} style={folderProposalStyles.name}>{folder.name}</Text>
          <Text numberOfLines={1} style={folderProposalStyles.path}>{folder.path}</Text>
        </View>
      </View>
      <View style={folderProposalStyles.metaRow}>
        <View style={folderProposalStyles.metaChip}>
          <Ionicons name="cube-outline" color="#B084FF" size={12} />
          <Text numberOfLines={1} style={folderProposalStyles.metaText}>{folder.stack || "Project"}</Text>
        </View>
        <View style={folderProposalStyles.metaChip}>
          <Ionicons name="desktop-outline" color="#B084FF" size={12} />
          <Text style={folderProposalStyles.metaText}>PC</Text>
        </View>
      </View>
      {proposal.error ? (
        <View style={folderProposalStyles.errorBox}>
          <Ionicons name="alert-circle-outline" color="#FFD166" size={14} />
          <Text style={folderProposalStyles.errorText}>{proposal.error}</Text>
        </View>
      ) : null}
      {resolved ? (
        <Text style={folderProposalStyles.status}>
          {accepted ? `Opened ${folder.name}` : "Dismissed"}
        </Text>
      ) : (
        <>
          <View style={folderProposalStyles.actions}>
            <Pressable
              onPress={() => onWrong?.(proposal.id, folder, query)}
              style={({ pressed }) => [folderProposalStyles.button, folderProposalStyles.buttonGhost, pressed && folderProposalStyles.buttonPressed]}
            >
              <Ionicons name="help-circle-outline" color="#D5D0E6" size={13} />
              <Text style={folderProposalStyles.buttonGhostText}>Wrong folder</Text>
            </Pressable>
            <Pressable
              onPress={() => onDismiss?.(proposal.id)}
              style={({ pressed }) => [folderProposalStyles.button, folderProposalStyles.buttonQuiet, pressed && folderProposalStyles.buttonPressed]}
            >
              <Text style={folderProposalStyles.buttonQuietText}>Not now</Text>
            </Pressable>
            <Pressable
              onPress={() => onAccept?.(proposal.id, folder)}
              style={({ pressed }) => [folderProposalStyles.button, folderProposalStyles.buttonPrimary, pressed && folderProposalStyles.buttonPressed]}
            >
              <Ionicons name="arrow-forward" color="#FFFFFF" size={14} />
              <Text style={folderProposalStyles.buttonPrimaryText}>Open folder</Text>
            </Pressable>
          </View>
        </>
      )}
    </View>
  );
}

function FolderRecoveryCard({ recovery, onBrowse, onSearch }: {
  recovery: NonNullable<ChatMessage["folderRecovery"]>;
  onBrowse?: (recovery: NonNullable<ChatMessage["folderRecovery"]>) => void;
  onSearch?: (proposalId: string, query: string, excludeProjectId?: string) => void;
}) {
  return (
    <View style={folderProposalStyles.recoveryCard}>
      <View style={folderProposalStyles.recoveryHeader}>
        <View style={folderProposalStyles.iconSmall}>
          <Ionicons name="search-outline" color="#B084FF" size={16} />
        </View>
        <View style={folderProposalStyles.headerText}>
          <Text style={folderProposalStyles.recoveryTitle}>Find the right folder</Text>
          <Text style={folderProposalStyles.recoverySubtitle}>Choose how Vibyra should search your PC.</Text>
        </View>
      </View>
      <View style={folderProposalStyles.actions}>
        <Pressable
          onPress={() => onBrowse?.(recovery)}
          style={({ pressed }) => [folderProposalStyles.button, folderProposalStyles.buttonGhost, pressed && folderProposalStyles.buttonPressed]}
        >
          <Ionicons name="folder-open-outline" color="#D5D0E6" size={13} />
          <Text style={folderProposalStyles.buttonGhostText}>Browse PC</Text>
        </Pressable>
        <Pressable
          onPress={() => onSearch?.(recovery.proposalId, recovery.query, recovery.excludedProjectId)}
          style={({ pressed }) => [folderProposalStyles.button, folderProposalStyles.buttonPrimary, pressed && folderProposalStyles.buttonPressed]}
        >
          <Ionicons name="sparkles-outline" color="#FFFFFF" size={14} />
          <Text style={folderProposalStyles.buttonPrimaryText}>Auto search PC</Text>
        </Pressable>
      </View>
    </View>
  );
}

const folderProposalStyles = StyleSheet.create({
  card: {
    marginTop: 10,
    backgroundColor: "rgba(18, 19, 30, 0.96)",
    borderColor: "rgba(176, 132, 255, 0.34)",
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    gap: 10
  },
  kickerRow: { alignItems: "center", flexDirection: "row", gap: 10, justifyContent: "space-between" },
  kickerPill: {
    alignItems: "center",
    backgroundColor: "rgba(142, 60, 255, 0.18)",
    borderColor: "rgba(176, 132, 255, 0.24)",
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: "row",
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 5
  },
  kickerText: { color: "#D7C4FF", fontSize: 11, fontWeight: "800" },
  matchCount: { color: "#8F8A9E", fontSize: 11, fontWeight: "700" },
  header: { flexDirection: "row", alignItems: "center", gap: 10 },
  icon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "rgba(176, 132, 255, 0.18)",
    alignItems: "center",
    justifyContent: "center"
  },
  headerText: { flex: 1, minWidth: 0 },
  name: { color: colors.text, fontSize: 16, fontWeight: "900" },
  path: { color: "#A29CB8", fontSize: 12, marginTop: 2 },
  metaRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  metaChip: {
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.06)",
    borderColor: "rgba(255,255,255,0.08)",
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: "row",
    gap: 5,
    minHeight: 26,
    paddingHorizontal: 9
  },
  metaText: { color: "#D5D0E6", fontSize: 11, fontWeight: "800", maxWidth: 150 },
  errorBox: {
    alignItems: "center",
    backgroundColor: "rgba(255, 209, 102, 0.09)",
    borderColor: "rgba(255, 209, 102, 0.22)",
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: "row",
    gap: 7,
    padding: 9
  },
  errorText: { color: "#FFE1A3", flex: 1, fontSize: 12, fontWeight: "700", lineHeight: 16 },
  recoveryCard: {
    backgroundColor: "rgba(18, 19, 30, 0.96)",
    borderColor: "rgba(176, 132, 255, 0.28)",
    borderRadius: 16,
    borderWidth: 1,
    gap: 10,
    marginTop: 10,
    padding: 14
  },
  recoveryHeader: { alignItems: "center", flexDirection: "row", gap: 10 },
  iconSmall: {
    alignItems: "center",
    backgroundColor: "rgba(176, 132, 255, 0.15)",
    borderRadius: 10,
    height: 34,
    justifyContent: "center",
    width: 34
  },
  recoveryTitle: { color: colors.text, fontSize: 15, fontWeight: "900" },
  recoverySubtitle: { color: "#A29CB8", fontSize: 12, fontWeight: "700", marginTop: 2 },
  status: { color: "#A29CB8", fontSize: 12, fontStyle: "italic" },
  searchBox: {
    backgroundColor: "rgba(255,255,255,0.045)",
    borderColor: "rgba(255,255,255,0.08)",
    borderRadius: 12,
    borderWidth: 1,
    gap: 8,
    padding: 10
  },
  searchInputRow: {
    alignItems: "center",
    backgroundColor: "rgba(7, 8, 15, 0.55)",
    borderColor: "rgba(255,255,255,0.1)",
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: "row",
    gap: 8,
    minHeight: 42,
    paddingHorizontal: 10
  },
  searchInput: { color: colors.text, flex: 1, fontSize: 14, fontWeight: "700", minWidth: 0, paddingVertical: 8 },
  searchActions: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 8, justifyContent: "flex-end" },
  button: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    justifyContent: "center",
    minHeight: 36,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 999
  },
  buttonGhost: {
    borderColor: "rgba(255,255,255,0.14)",
    borderWidth: 1
  },
  buttonGhostText: { color: "#D5D0E6", fontSize: 13, fontWeight: "700" },
  buttonQuiet: { backgroundColor: "rgba(255,255,255,0.06)" },
  buttonQuietText: { color: "#A29CB8", fontSize: 13, fontWeight: "700" },
  buttonPrimary: { backgroundColor: "#8E3CFF" },
  buttonPrimaryText: { color: "#FFFFFF", fontSize: 13, fontWeight: "800" },
  buttonDisabled: { opacity: 0.45 },
  buttonPressed: { opacity: 0.85 }
});

export function TypingIndicator() {
  const dot1 = useRef(new Animated.Value(0)).current;
  const dot2 = useRef(new Animated.Value(0)).current;
  const dot3 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const sequence = (value: Animated.Value, delay: number) => Animated.loop(
      Animated.sequence([
        Animated.timing(value, { toValue: 1, duration: 360, delay, useNativeDriver: Platform.OS !== "web" }),
        Animated.timing(value, { toValue: 0, duration: 360, useNativeDriver: Platform.OS !== "web" })
      ])
    );
    const animation = Animated.parallel([
      sequence(dot1, 0),
      sequence(dot2, 140),
      sequence(dot3, 280)
    ]);
    animation.start();
    return () => animation.stop();
  }, [dot1, dot2, dot3]);

  const dotStyle = (value: Animated.Value) => ({
    opacity: value.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }),
    transform: [{ translateY: value.interpolate({ inputRange: [0, 1], outputRange: [0, -3] }) }]
  });

  return (
    <View style={styles.typingIndicator}>
      <Animated.View style={[styles.typingDot, dotStyle(dot1)]} />
      <Animated.View style={[styles.typingDot, dotStyle(dot2)]} />
      <Animated.View style={[styles.typingDot, dotStyle(dot3)]} />
    </View>
  );
}

export function AppPreviewCard({ app, onOpen }: { app: GeneratedApp; onOpen: (app: GeneratedApp) => void }) {
  return (
    <Pressable onPress={() => onOpen(app)} style={styles.appPreviewCard}>
      <LinearGradient
        colors={["#8E3CFF", "#5D24D8"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.appPreviewIcon}
      >
        <Ionicons name="play" color="#FFFFFF" size={20} />
      </LinearGradient>
      <View style={styles.appPreviewBody}>
        <Text style={styles.appPreviewLabel}>Runnable preview</Text>
        <Text numberOfLines={1} style={styles.appPreviewTitle}>{app.title}</Text>
        <Text numberOfLines={1} style={styles.appPreviewHint}>Tap to open the app inside Vibyra</Text>
      </View>
      <View style={styles.appPreviewArrow}>
        <Ionicons name="chevron-forward" color="#C9C2D6" size={18} />
      </View>
    </Pressable>
  );
}

export function AppPreviewModal({ app, onClose }: { app: GeneratedApp | null; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (app) setReloadKey(0);
  }, [app?.id]);

  if (!app) return null;

  return (
    <Modal animationType="slide" presentationStyle="fullScreen" visible onRequestClose={onClose}>
      <View style={[styles.appModalScreen, { paddingTop: insets.top }]}>
        <View style={styles.appModalHeader}>
          <Pressable onPress={onClose} style={styles.appModalIconButton}>
            <Ionicons name="close" color="#FFFFFF" size={22} />
          </Pressable>
          <View style={styles.appModalTitleStack}>
            <Text style={styles.appModalLabel}>Vibyra preview</Text>
            <Text numberOfLines={1} style={styles.appModalTitle}>{app.title}</Text>
          </View>
          <Pressable onPress={() => setReloadKey((k) => k + 1)} style={styles.appModalIconButton}>
            <Ionicons name="refresh" color="#FFFFFF" size={20} />
          </Pressable>
        </View>
        <View style={styles.appModalWebContainer}>
          <AppWebView html={app.html} url={app.url} reloadKey={reloadKey} style={styles.appModalWebView} />
        </View>
      </View>
    </Modal>
  );
}

const codeReviewStyles = StyleSheet.create({
  actionButton: {
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.07)",
    borderColor: "rgba(255,255,255,0.1)",
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 30,
    paddingHorizontal: 10
  },
  actionDisabled: { opacity: 0.45 },
  actionPressed: { transform: [{ scale: 0.98 }] },
  actionText: { color: "#F2EEFF", fontSize: 12, fontWeight: "800" },
  card: {
    backgroundColor: "rgba(12, 14, 22, 0.96)",
    borderColor: "rgba(124, 255, 177, 0.18)",
    borderRadius: 12,
    borderWidth: 1,
    gap: 9,
    marginTop: 10,
    padding: 12
  },
  closeButton: {
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 10,
    height: 38,
    justifyContent: "center",
    width: 38
  },
  codeContent: { padding: 14 },
  codeScroll: { backgroundColor: "#090B12", flex: 1 },
  codeText: {
    color: "#ECE8F8",
    fontFamily: Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }),
    fontSize: 12,
    lineHeight: 18
  },
  fileIcon: {
    alignItems: "center",
    backgroundColor: "rgba(191, 174, 255, 0.11)",
    borderRadius: 8,
    height: 30,
    justifyContent: "center",
    width: 30
  },
  fileMain: { flex: 1, minWidth: 0 },
  fileName: { color: "#FFFFFF", fontSize: 13, fontWeight: "900" },
  fileStats: { color: "#89F4B8", fontSize: 11, fontWeight: "800", marginTop: 2 },
  header: { alignItems: "center", flexDirection: "row", gap: 10, justifyContent: "space-between" },
  iconButton: {
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.07)",
    borderColor: "rgba(255,255,255,0.1)",
    borderRadius: 8,
    borderWidth: 1,
    height: 30,
    justifyContent: "center",
    width: 32
  },
  kicker: { color: "#8EF3B7", fontSize: 10, fontWeight: "900", letterSpacing: 0.6, textTransform: "uppercase" },
  modalHeader: {
    alignItems: "center",
    backgroundColor: "#11131D",
    borderBottomColor: "rgba(255,255,255,0.08)",
    borderBottomWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    padding: 14
  },
  modalOverlay: { backgroundColor: "rgba(0,0,0,0.54)", flex: 1, justifyContent: "flex-end" },
  modalSheet: { backgroundColor: "#090B12", borderTopLeftRadius: 18, borderTopRightRadius: 18, height: "78%", overflow: "hidden" },
  modalTitle: { color: "#FFFFFF", fontSize: 16, fontWeight: "900", marginTop: 3, maxWidth: 250 },
  row: { alignItems: "center", flexDirection: "row", gap: 8 },
  title: { color: "#FFFFFF", fontSize: 15, fontWeight: "900", marginTop: 2 },
  totals: { color: "#89F4B8", fontSize: 12, fontWeight: "900" }
});
