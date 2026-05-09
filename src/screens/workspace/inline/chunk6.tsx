import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator, Animated, Image, ImageBackground, KeyboardAvoidingView, Linking, Modal,
  NativeScrollEvent, NativeSyntheticEvent, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions
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
import { aiChatGlyph, chatBuildAiHero, communityHero, projectsBackdrop, projectsFoldersHero, vibyraLogo } from "../data/assets";
import { chatModelGroups, chatModelOptions, providerLogoSources } from "../data/chatModels";
import { COMMUNITY_COMMENTS_KEY, communityDetailAccent, communityDetailAccentDark, communityPosts } from "../data/community";
import { chatSuggestions, pages, previousChats, projectFilterModes, projectStatuses, tokenMembership } from "../data/pages";
import { styles } from "../styles";
import type { ChatModelOption, ChatModelProvider, CommunityComment, CommunityDetailTab, CommunityFilter, CommunityLogoKind, CommunityPost, CommunityPreviewKind, DashboardPage, DesktopCandidate, ProjectDisplay, ProjectLayout, SettingsTab } from "../types";
import { HomeAction, RunningProjectsPanel } from "./index";

export function DashboardHome(props: {
  activeAgents: Agent[];
  machineName: string;
  onNavigate: (page: DashboardPage) => void;
  projectCount: number;
  projects: Project[];
  selectedModel: string;
  tokenBalance: number;
}) {
  const { height } = useWindowDimensions();
  const compact = height < 780;
  const displayProjectCount = Math.max(props.projectCount, 7);
  const runningProjects = props.activeAgents.slice(0, compact ? 1 : 2).map((agent, index) => {
    const project = props.projects.find((item) => item.id === agent.projectId);
    return {
      agent,
      projectName: project?.name ?? "Current project",
      time: agent.state === "waiting" ? "3m waiting" : index === 0 ? "8m running" : "1m running"
    };
  });

  return (
    <View style={[styles.dashboardPage, compact ? styles.dashboardPageCompact : null]}>
      <View style={[styles.welcomePanel, compact ? styles.welcomePanelCompact : null]}>
        <LinearGradient
          colors={["rgba(0, 0, 0, 0)", "rgba(0, 0, 0, 0)"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.welcomeBackdrop}
        >
          <View style={styles.welcomeHeroLeft}>
            <View style={styles.welcomeLivePill}>
              <View style={styles.welcomeLiveDot} />
              <Text style={styles.welcomeLiveText}>{runningProjects.length || 0} live</Text>
            </View>
            <Text style={styles.welcomeTitle}>Ready to build</Text>
          </View>
        </LinearGradient>
      </View>

      <RunningProjectsPanel
        onCreateBuild={() => props.onNavigate("chat")}
        onOpenProjects={() => props.onNavigate("projects")}
        runningProjects={runningProjects}
      />

      <View style={styles.homeActions}>
        <HomeAction icon="folder-open-outline" label="Projects" meta={`${displayProjectCount} saved workspaces`} onPress={() => props.onNavigate("projects")} />
        <HomeAction icon="chatbubble-ellipses-outline" label="AI Chat" meta="Start a build chat" onPress={() => props.onNavigate("chat")} />
        <HomeAction icon="people-outline" label="Community" meta="Explore shared ideas" onPress={() => props.onNavigate("community")} />
        <HomeAction icon="card-outline" label="Plan & Billing" meta="Manage usage and plan" onPress={() => props.onNavigate("profile")} />
      </View>
    </View>
  );
}
