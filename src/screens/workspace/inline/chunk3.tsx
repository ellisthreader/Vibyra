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
import type { Agent, ChatMessage, GeneratedApp, ModelKey, Project, RememberedDesktop } from "../../../types/domain";
import { appApiRequest } from "../../../utils/appApi";
import { normalizeAgentUrl } from "../../../utils/network";
import { aiChatGlyph, chatBuildAiHero, communityHero, dashboardHeroArt, projectsBackdrop, projectsFoldersHero, vibyraLogo } from "../data/assets";
import { chatModelGroups, chatModelOptions, providerLogoSources } from "../data/chatModels";
import { COMMUNITY_COMMENTS_KEY, communityDetailAccent, communityDetailAccentDark, communityPosts } from "../data/community";
import { chatSuggestions, pages, previousChats, projectFilterModes, projectStatuses, tokenMembership } from "../data/pages";
import { styles } from "../styles";
import { useThemedColor } from "../../../context/PreferencesContext";
import type { ChatModelOption, ChatModelProvider, CommunityComment, CommunityDetailTab, CommunityFilter, CommunityLogoKind, CommunityPost, CommunityPreviewKind, DashboardPage, DesktopCandidate, ProjectDisplay, ProjectLayout, SettingsTab } from "../types";

export function TokenBalancePill({ compact, onOpenTokens, tokenBalance }: {
  compact: boolean;
  onOpenTokens: () => void;
  tokenBalance: number;
}) {
  const flashColor = useThemedColor("#DDBBFF");
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Open token balance and membership"
      hitSlop={8}
      onPress={onOpenTokens}
      style={({ pressed }) => [styles.tokenPill, pressed ? styles.tokenPillPressed : null]}
    >
      <Ionicons name="flash" color={flashColor} size={compact ? 15 : 16} />
      <Text style={styles.tokenText}>{tokenBalance.toLocaleString()}</Text>
    </Pressable>
  );
}

export function getTopBarTitle(page: DashboardPage) {
  if (page === "projects") return "Projects";
  if (page === "community") return "Community";
  if (page === "profile") return "Profile";
  if (page === "chat") return "AI Chat";
  return "Home";
}

export function projectPreviewUrl(baseUrl: string, projectId: string, token: string) {
  return `${normalizeAgentUrl(baseUrl)}/preview/project/${encodeURIComponent(projectId)}/${encodeURIComponent(token)}/`;
}

export function RenameChatModal({ draft, onCancel, onChangeDraft, onSave, visible }: {
  draft: string;
  onCancel: () => void;
  onChangeDraft: (value: string) => void;
  onSave: () => void;
  visible: boolean;
}) {
  return (
    <Modal animationType="fade" onRequestClose={onCancel} transparent visible={visible}>
      <View style={styles.renameChatOverlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onCancel} />
        <View style={styles.renameChatDialog}>
          <View style={styles.renameChatHeader}>
            <View style={styles.renameChatIcon}>
              <Ionicons name="create-outline" color="#DCD7EA" size={22} />
            </View>
            <View style={styles.renameChatCopy}>
              <Text style={styles.renameChatTitle}>Rename chat</Text>
              <Text style={styles.renameChatSubtitle}>Give this chat a clearer title.</Text>
            </View>
          </View>
          <TextInput
            autoFocus
            onChangeText={onChangeDraft}
            onSubmitEditing={onSave}
            placeholder="Chat title"
            placeholderTextColor="#8F8A9E"
            returnKeyType="done"
            style={styles.renameChatInput}
            value={draft}
          />
          <View style={styles.renameChatActions}>
            <Pressable style={styles.renameChatCancelButton} onPress={onCancel}>
              <Text style={styles.renameChatCancelText}>Cancel</Text>
            </Pressable>
            <Pressable style={styles.renameChatSaveButton} onPress={onSave}>
              <Text style={styles.renameChatSaveText}>Save</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

export function getDesktopStatusLabel(status: RememberedDesktop["status"]) {
  if (status === "current") return "Connected now";
  if (status === "online") return "Available nearby";
  if (status === "checking") return "Checking activity...";
  return "Not reachable on this Wi-Fi";
}

export function getDesktopStatusStyle(status: RememberedDesktop["status"]) {
  if (status === "current") return styles.pcCandidateStatusCurrent;
  if (status === "online") return styles.pcCandidateStatusOnline;
  if (status === "checking") return styles.pcCandidateStatusChecking;
  return styles.pcCandidateStatusOffline;
}
