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
import { usePreferences } from "../../../context/PreferencesContext";
import type { Agent, ChatMessage, GeneratedApp, ModelKey, Project, RememberedDesktop } from "../../../types/domain";
import { appApiRequest } from "../../../utils/appApi";
import { fetchWithTimeout, normalizeAgentUrl } from "../../../utils/network";
import { aiChatGlyph, chatBuildAiHero, communityHero, dashboardHeroArt, projectsBackdrop, projectsFoldersHero, vibyraLogo } from "../data/assets";
import { chatModelGroups, chatModelOptions, providerLogoSources } from "../data/chatModels";
import { COMMUNITY_COMMENTS_KEY, communityDetailAccent, communityDetailAccentDark, communityPosts } from "../data/community";
import { chatSuggestions, pages, previousChats, projectFilterModes, projectStatuses, tokenMembership } from "../data/pages";
import { styles } from "../styles";
import { HomeBuildCard } from "./HomeBuildCard";
import type { ChatModelOption, ChatModelProvider, CommunityComment, CommunityDetailTab, CommunityFilter, CommunityLogoKind, CommunityPost, CommunityPreviewKind, DashboardPage, DesktopCandidate, ProjectDisplay, ProjectLayout, SettingsTab } from "../types";

export function RunningProjectsPanel({ buildingCount, onCreateBuild, queuedCount, runningProjects }: {
  buildingCount: number;
  onCreateBuild: () => void;
  queuedCount: number;
  runningProjects: Array<{
    agent: Agent;
    projectName: string;
  }>;
}) {
  const prefs = usePreferences();
  const hasRunning = runningProjects.length > 0;
  const inProgress = runningProjects.filter((item) => item.agent.state === "running");
  const queued = runningProjects.filter((item) => item.agent.state === "waiting");

  const emptyCtaGradient = prefs.effectiveScheme === "light" ? ["#7C3AED", "#6D3BFF", "#4F46E5"] as const : ["#7C2DFF", "#AA35FF", "#6C22E8"] as const;

  return (
    <View style={[styles.runningProjectsPanel, !hasRunning ? styles.runningProjectsPanelEmpty : null]}>
      {hasRunning ? (
        <>
          <View style={styles.homeQueueStats}>
            <View style={styles.homeQueueStat}>
              <Text style={styles.homeQueueStatValue}>{buildingCount}</Text>
              <Text style={styles.homeQueueStatLabel}>Building</Text>
            </View>
            <View style={styles.homeQueueStat}>
              <Text style={[styles.homeQueueStatValue, styles.homeQueueStatValueQueued]}>{queuedCount}</Text>
              <Text style={[styles.homeQueueStatLabel, styles.homeQueueStatLabelQueued]}>Queued</Text>
            </View>
          </View>

          <View style={styles.runningProjectsList}>
          <ScrollView
            contentContainerStyle={styles.runningProjectsScrollContent}
            nestedScrollEnabled
            showsVerticalScrollIndicator={false}
            style={styles.runningProjectsScroll}
          >
            {inProgress.length > 0 ? (
              <View style={styles.homeQueueSection}>
                <Text style={styles.homeQueueSectionTitle}>In progress</Text>
                {inProgress.map((item) => <HomeBuildCard key={item.agent.id} item={item} />)}
              </View>
            ) : null}
            {queued.length > 0 ? (
              <View style={styles.homeQueueSection}>
                <Text style={styles.homeQueueSectionTitle}>Queued</Text>
                {queued.map((item) => <HomeBuildCard key={item.agent.id} item={item} />)}
              </View>
            ) : null}
          </ScrollView>
          </View>
        </>
      ) : (
        <View style={styles.runningProjectsEmpty}>
          <Image source={projectsFoldersHero} style={styles.runningProjectsEmptyImage} resizeMode="contain" />
          <View style={styles.runningProjectsEmptyCopy}>
            <Text style={styles.runningProjectsEmptyTitle}>Nothing is being built yet</Text>
            <Text style={styles.runningProjectsEmptyText}>Create your first build and get started{"\n"}with Vibyra.</Text>
          </View>
          <Pressable style={({ pressed }) => [styles.runningProjectsEmptyButton, pressed ? styles.runningProjectsEmptyButtonPressed : null]} onPress={onCreateBuild}>
            <LinearGradient
              colors={emptyCtaGradient}
              start={{ x: 0, y: 0.5 }}
              end={{ x: 1, y: 0.5 }}
              style={styles.runningProjectsEmptyButtonGradient}
            >
              <Ionicons name="add" color={colors.text} size={24} />
              <Text style={styles.runningProjectsEmptyButtonText}>Create your first build</Text>
            </LinearGradient>
          </Pressable>
        </View>
      )}
    </View>
  );
}
