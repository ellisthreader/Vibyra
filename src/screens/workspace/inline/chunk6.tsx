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

// PREVIEW_FAKE_BUILDS: demo-only fixtures, never rendered unless EXPO_PUBLIC_FAKE_BUILDS=1.
const PREVIEW_FAKE_BUILDS: Array<{ agent: Agent; projectName: string }> = [
  { projectName: "Recipe App", agent: { id: "preview-1", title: "Building the home screen", model: "gpt-5.5", projectId: "preview-recipe", chatProjectId: "preview-recipe", startedAt: Date.now() - 4 * 60000, state: "running", progress: 68, file: "src/screens/HomeScreen.tsx" } },
  { projectName: "Workout Tracker", agent: { id: "preview-2", title: "Wiring up set + rep logging", model: "gpt-5.4", projectId: "preview-workout", chatProjectId: "preview-workout", startedAt: Date.now() - 2 * 60000, state: "running", progress: 34, file: "src/components/SetTracker.tsx" } },
  { projectName: "Budget Tracker", agent: { id: "preview-3", title: "Setting up expense categories", model: "gpt-5.5", projectId: "preview-budget", chatProjectId: "preview-budget", startedAt: Date.now(), state: "waiting", progress: 0, file: "" } },
  { projectName: "Habit Streaks", agent: { id: "preview-4", title: "Add daily streak reminders", model: "gpt-5.4", projectId: "preview-habit", chatProjectId: "preview-habit", startedAt: Date.now(), state: "waiting", progress: 0, file: "" } },
  { projectName: "Landing Page", agent: { id: "preview-5", title: "Generated responsive landing page", model: "gpt-5.5", projectId: "preview-landing", chatProjectId: "preview-landing", startedAt: Date.now() - 60000, completedAt: Date.now(), state: "complete", progress: 100, file: "src/app/page.tsx" } }
];

export function DashboardHome(props: {
  agents: Agent[];
  onNavigate: (page: DashboardPage) => void;
  onOpenBuildChat: (chatProjectId: string) => void;
  onUsePrompt: (prompt: string) => void;
  projects: Project[];
}) {
  const { height } = useWindowDimensions();
  const compact = height < 780;
  const activeWork = props.agents
    .filter((agent) => agent.state === "running" || agent.state === "waiting" || agent.state === "complete")
    .sort((a, b) => stateRank(a.state) - stateRank(b.state));
  const realRunningProjects = activeWork
    .map((agent) => {
      const project = props.projects.find((item) => item.id === agent.projectId);
      return {
        agent,
        projectName: project?.name ?? "Current project"
      };
    });

  // PREVIEW_FAKE_BUILDS: opt-in demo data so the Builds page can be eyeballed populated.
  // OFF by default — honors the "no fake data on Builds" rule (see Decisions.md 2026-06-06).
  // Enable with EXPO_PUBLIC_FAKE_BUILDS=1 then restart Expo. Remove this block before shipping.
  const runningProjects = process.env.EXPO_PUBLIC_FAKE_BUILDS === "1" ? PREVIEW_FAKE_BUILDS : realRunningProjects;

  return (
    <View style={[styles.dashboardPage, compact ? styles.dashboardPageCompact : null]}>
      <RunningProjectsPanel
        onCreateBuild={() => props.onNavigate("chat")}
        onOpenBuildChat={props.onOpenBuildChat}
        onUsePrompt={props.onUsePrompt}
        runningProjects={runningProjects}
      />
    </View>
  );
}

function stateRank(state: Agent["state"]) {
  if (state === "running") return 0;
  if (state === "waiting") return 1;
  if (state === "complete") return 2;
  return 3;
}
