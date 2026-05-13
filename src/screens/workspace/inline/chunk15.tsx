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
import { CommunityAppLogo } from "./chunk16";

export function getCommunitySeedComments(post: CommunityPost): CommunityComment[] {
  void post;
  return [];
}

export function CommunityOpenedAppPage({ opened, post }: { opened: boolean; post: CommunityPost }) {
  return (
    <View style={styles.communityOpenedAppScreen}>
      <View style={styles.communityOpenedAppIntro}>
        <CommunityAppLogo accent={communityDetailAccent} post={post} size={64} />
        <View style={styles.communityOpenedAppCopy}>
          <Text style={styles.communityOpenedAppKicker}>{opened ? "Opened app" : "App preview"}</Text>
          <Text numberOfLines={2} style={styles.communityOpenedAppTitle}>{formatCommunityTitle(post.title)}</Text>
          <Text style={styles.communityOpenedAppSubtitle}>{post.description}</Text>
        </View>
      </View>
      <CommunityAppExperience post={post} />
    </View>
  );
}

export function CommunityAppExperience({ post }: { post: CommunityPost }) {
  return (
    <View style={styles.communityAppExperience}>
      <View style={styles.communityAppExperienceHeader}>
        <View>
          <Text style={styles.communityAppExperienceKicker}>Live preview</Text>
          <Text style={styles.communityAppExperienceTitle}>{formatCommunityTitle(post.title)}</Text>
        </View>
        <View style={styles.communityAppLivePill}>
          <View style={styles.communityAppLiveDot} />
          <Text style={styles.communityAppLiveText}>Open</Text>
        </View>
      </View>
      {post.appUrl ? (
        <View style={[styles.communityDemoPanel, { height: 420, overflow: "hidden", padding: 0 }]}>
          <AppWebView reloadKey={post.id.length} url={post.appUrl} />
        </View>
      ) : (
        <View style={styles.communityDemoPanel}>
          <Text style={styles.communityDemoLabel}>Live app data</Text>
          <Text style={styles.communityDemoValue}>Unavailable</Text>
          <Text style={styles.communityDemoLineText}>This community app does not expose a live preview payload yet.</Text>
        </View>
      )}
    </View>
  );
}

export function formatCommunityTitle(title: string) {
  return title.replace(/\b\w/g, (letter) => letter.toUpperCase()).replace(/\bAi\b/g, "AI").replace(/\bSaas\b/g, "SaaS");
}
