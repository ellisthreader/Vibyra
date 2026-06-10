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
import { useThemedColor } from "../../../context/PreferencesContext";
import type { Agent, ChatMessage, GeneratedApp, ModelKey, Project, RememberedDesktop } from "../../../types/domain";
import { appApiRequest } from "../../../utils/appApi";
import { fetchWithTimeout, normalizeAgentUrl } from "../../../utils/network";
import { aiChatGlyph, chatBuildAiHero, communityHero, dashboardHeroArt, projectsBackdrop, projectsFoldersHero, vibyraLogo } from "../data/assets";
import { chatModelGroups, chatModelOptions, providerLogoSources } from "../data/chatModels";
import { COMMUNITY_COMMENTS_KEY, communityDetailAccent, communityDetailAccentDark, communityPosts } from "../data/community";
import { chatSuggestions, pages, previousChats, projectFilterModes, projectStatuses, tokenMembership } from "../data/pages";
import { styles } from "../styles";
import type { ChatModelOption, ChatModelProvider, CommunityComment, CommunityDetailTab, CommunityFilter, CommunityLogoKind, CommunityPost, CommunityPreviewKind, DashboardPage, DesktopCandidate, ProjectDisplay, ProjectLayout, SettingsTab } from "../types";
import { AccountAvatar } from "./AccountAvatar";
import { TokenBalancePill, getTopBarTitle } from "./chunk3";

export function TopBar({
  activePage,
  accountName,
  canOpenPreview,
  chatDirectory,
  chatTitle,
  chatHasConversation,
  chatStarred,
  communitySubPageOpen,
  onBackFromCommunity,
  onChatHelp,
  onDeleteChat,
  onOpenAccount,
  onOpenMenu,
  onOpenPreview,
  onRenameChat,
  onToggleStarChat,
  profileImageUri,
}: {
  activePage: DashboardPage;
  accountName: string;
  canOpenPreview: boolean;
  chatDirectory?: string;
  chatTitle: string;
  chatHasConversation: boolean;
  chatStarred: boolean;
  communitySubPageOpen: boolean;
  onBackFromCommunity: () => void;
  onChatHelp: () => void;
  onDeleteChat: () => void;
  onOpenAccount: () => void;
  onOpenMenu: () => void;
  onOpenPreview: () => void;
  onRenameChat: () => void;
  onToggleStarChat: () => void;
  profileImageUri: string;
}) {
  const title = getTopBarTitle(activePage);
  const previewIconColor = useThemedColor("#7CF1B3");
  const topIconColor = useThemedColor("#F6F2FF");
  const [chatMenuOpen, setChatMenuOpen] = useState(false);

  const runChatMenuAction = (action: () => void) => {
    setChatMenuOpen(false);
    action();
  };

  if (activePage === "chat") {
    return (
      <View style={[styles.topBar, styles.chatTopBar, styles.chatIconOnlyTopBar]}>
        <View style={styles.chatTopLeft}>
          <Pressable accessibilityLabel="Open workspace menu" style={({ pressed }) => [styles.chatTopIconButton, pressed && { opacity: 0.65, transform: [{ scale: 0.94 }] }]} onPress={onOpenMenu}>
            <Ionicons name="menu" color={topIconColor} size={23} />
          </Pressable>
        </View>
        <View style={styles.chatTopActions}>
          {canOpenPreview ? (
            <Pressable accessibilityLabel="Open live preview" style={({ pressed }) => [styles.previewTopButton, pressed && { opacity: 0.72, transform: [{ scale: 0.96 }] }]} onPress={onOpenPreview}>
              <Ionicons name="play" color={previewIconColor} size={18} />
            </Pressable>
          ) : null}
          {chatHasConversation ? (
            <View style={styles.chatMoreMenuWrap}>
              <Pressable accessibilityLabel="Open chat options" style={({ pressed }) => [styles.chatMoreButton, pressed && { opacity: 0.7, transform: [{ scale: 0.96 }] }]} onPress={() => setChatMenuOpen((open) => !open)}>
                <Ionicons name="ellipsis-horizontal" color={topIconColor} size={21} />
              </Pressable>
              {chatMenuOpen ? (
                <View style={styles.chatOptionsMenu}>
                  <ChatOptionsRow icon={chatStarred ? "star" : "star-outline"} label={chatStarred ? "Starred" : "Star"} tone="star" onPress={() => runChatMenuAction(onToggleStarChat)} />
                  <ChatOptionsRow icon="create-outline" label="Rename" tone="rename" onPress={() => runChatMenuAction(onRenameChat)} />
                  <ChatOptionsRow icon="help-circle-outline" label="Help" tone="help" onPress={() => runChatMenuAction(onChatHelp)} />
                  <ChatOptionsRow icon="trash-outline" label="Delete" tone="delete" onPress={() => runChatMenuAction(onDeleteChat)} />
                </View>
              ) : null}
            </View>
          ) : null}
        </View>
      </View>
    );
  }

  if (activePage === "community" && communitySubPageOpen) {
    return (
      <View style={[styles.topBar, styles.chatTopBar]}>
        <View style={styles.chatTopLeft}>
          <Pressable accessibilityLabel="Back to community" style={styles.chatTopIconButton} onPress={onBackFromCommunity}>
            <Ionicons name="chevron-back" color={colors.text} size={26} />
          </Pressable>
        </View>
        <View style={styles.chatTopActions}>
          <Pressable accessibilityLabel="Open account menu" style={styles.accountTopButton} onPress={onOpenAccount}>
            <AccountAvatar imageUri={profileImageUri} name={accountName} size={38} textSize={16} />
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.topBar}>
      <Pressable accessibilityLabel="Open workspace menu" style={styles.chatTopIconButton} onPress={onOpenMenu}>
        <Ionicons name="menu" color={colors.text} size={24} />
      </Pressable>
      <View style={styles.pageTopTitleBlock}>
        <Text numberOfLines={1} style={styles.pageTopTitle}>{title}</Text>
      </View>
      {activePage === "profile" ? (
        <View style={styles.topRight}>
          <View style={styles.accountTopButton} />
        </View>
      ) : (
        <View style={styles.topRight}>
          <Pressable accessibilityLabel="Open account menu" style={styles.accountTopButton} onPress={onOpenAccount}>
            <AccountAvatar imageUri={profileImageUri} name={accountName} size={38} textSize={16} />
          </Pressable>
        </View>
      )}
    </View>
  );
}

function ChatOptionsRow({ icon, label, onPress, tone }: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  tone: "star" | "rename" | "help" | "delete";
}) {
  const color = {
    star: "#FFD76A",
    rename: "#A88BFF",
    help: "#B9B5C8",
    delete: "#FF9DAE"
  }[tone];
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.chatOptionsRow, pressed ? styles.chatOptionsRowPressed : null]}>
      <Ionicons name={icon} color={color} size={18} />
      <Text style={[styles.chatOptionsLabel, tone === "delete" ? styles.chatOptionsLabelDelete : null]}>{label}</Text>
    </Pressable>
  );
}
