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
import { fetchWithTimeout, normalizeAgentUrl } from "../../../utils/network";
import { aiChatGlyph, chatBuildAiHero, communityHero, dashboardHeroArt, projectsBackdrop, projectsFoldersHero, vibyraLogo } from "../data/assets";
import { chatModelGroups, chatModelOptions, providerLogoSources } from "../data/chatModels";
import { COMMUNITY_COMMENTS_KEY, communityDetailAccent, communityDetailAccentDark, communityPosts } from "../data/community";
import { chatSuggestions, pages, previousChats, projectFilterModes, projectStatuses, tokenMembership } from "../data/pages";
import { styles } from "../styles";
import type { ChatModelOption, ChatModelProvider, CommunityComment, CommunityDetailTab, CommunityFilter, CommunityLogoKind, CommunityPost, CommunityPreviewKind, DashboardPage, DesktopCandidate, ProjectDisplay, ProjectLayout, SettingsTab } from "../types";
import { TokenBalancePill, getTopBarTitle } from "./index";

export function TopBar({
  activePage,
  chatTitle,
  compact,
  communitySubPageTitle,
  isConnected,
  machineName,
  onBackFromChat,
  onBackFromCommunity,
  onDeleteChat,
  onOpenPcSwitcher,
  onOpenTokens,
  onRenameChat,
  tokenBalance
}: {
  activePage: DashboardPage;
  chatTitle: string;
  compact: boolean;
  communitySubPageTitle: string;
  isConnected: boolean;
  machineName: string;
  onBackFromChat: () => void;
  onBackFromCommunity: () => void;
  onDeleteChat: () => void;
  onOpenPcSwitcher: () => void;
  onOpenTokens: () => void;
  onRenameChat: () => void;
  tokenBalance: number;
}) {
  const title = getTopBarTitle(activePage);

  if (activePage === "chat") {
    return (
      <View style={[styles.topBar, styles.chatTopBar]}>
        <View style={styles.chatTopLeft}>
          <Pressable accessibilityLabel="Back to home" style={styles.chatTopIconButton} onPress={onBackFromChat}>
            <Ionicons name="chevron-back" color={colors.text} size={26} />
          </Pressable>
        </View>
        <View pointerEvents="none" style={styles.chatTopTitleWrap}>
          <Text numberOfLines={1} style={styles.chatTopTitle}>{chatTitle}</Text>
        </View>
        <View style={styles.chatTopActions}>
          <Pressable accessibilityLabel="Rename chat" style={styles.chatTopIconButton} onPress={onRenameChat}>
            <Ionicons name="create-outline" color="#DCD7EA" size={22} />
          </Pressable>
          <Pressable accessibilityLabel="Delete chat" style={styles.chatTopIconButton} onPress={onDeleteChat}>
            <Ionicons name="trash-outline" color="#FF9DAE" size={22} />
          </Pressable>
        </View>
      </View>
    );
  }

  if (activePage === "community" && communitySubPageTitle) {
    return (
      <View style={[styles.topBar, styles.chatTopBar]}>
        <View style={styles.chatTopLeft}>
          <Pressable accessibilityLabel="Back to community" style={styles.chatTopIconButton} onPress={onBackFromCommunity}>
            <Ionicons name="chevron-back" color={colors.text} size={26} />
          </Pressable>
        </View>
        <View pointerEvents="none" style={styles.chatTopTitleWrap}>
          <Text numberOfLines={1} style={styles.chatTopTitle}>{communitySubPageTitle}</Text>
        </View>
        <View style={styles.chatTopActions}>
          <TokenBalancePill compact={compact} onOpenTokens={onOpenTokens} tokenBalance={tokenBalance} />
        </View>
      </View>
    );
  }

  if (activePage !== "dashboard") {
    return (
      <View style={styles.topBar}>
        <View style={styles.pageTopTitleBlock}>
          <Text numberOfLines={1} style={styles.pageTopTitle}>{title}</Text>
        </View>
        <View style={styles.topRight}>
          <TokenBalancePill compact={compact} onOpenTokens={onOpenTokens} tokenBalance={tokenBalance} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.topBar}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Change connected PC"
        hitSlop={8}
        onPress={onOpenPcSwitcher}
        style={({ pressed }) => [styles.topLeft, pressed ? styles.topLeftPressed : null]}
      >
        <VibyraLogo compact style={styles.dashboardLogo as ImageStyle} />
        <View style={styles.topMachineCopy}>
          <View style={styles.topConnectionRow}>
            <View style={[styles.statusDot, isConnected ? null : styles.statusDotOffline]} />
            <Text style={styles.topKicker}>{isConnected ? "Connected to PC" : "Not connected"}</Text>
          </View>
          <View style={styles.topTitleRow}>
            <Text numberOfLines={1} style={styles.topTitle}>{machineName}</Text>
            <Ionicons name="chevron-down" color="#A9A6BE" size={16} />
          </View>
        </View>
      </Pressable>
      <View style={styles.topRight}>
        <TokenBalancePill compact={compact} onOpenTokens={onOpenTokens} tokenBalance={tokenBalance} />
      </View>
    </View>
  );
}

