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
import { RunningProjectsPanel } from "./chunk7";

export function DashboardHome(props: {
  activeAgents: Agent[];
  onNavigate: (page: DashboardPage) => void;
  projects: Project[];
}) {
  const { height } = useWindowDimensions();
  const compact = height < 780;
  const activeWork = props.activeAgents
    .filter((agent) => agent.state === "running" || agent.state === "waiting")
    .sort((a, b) => (a.state === b.state ? 0 : a.state === "running" ? -1 : 1));
  const runningProjects = activeWork
    .map((agent) => {
      const project = props.projects.find((item) => item.id === agent.projectId);
      return {
        agent,
        projectName: project?.name ?? "Current project"
      };
    });

  return (
    <View style={[styles.dashboardPage, compact ? styles.dashboardPageCompact : null]}>
      <RunningProjectsPanel
        buildingCount={activeWork.filter((agent) => agent.state === "running").length}
        queuedCount={activeWork.filter((agent) => agent.state === "waiting").length}
        onCreateBuild={() => props.onNavigate("chat")}
        runningProjects={runningProjects}
      />
    </View>
  );
}
