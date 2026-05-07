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

export function RunningProjectsPanel({ onCreateBuild, onOpenProjects, runningProjects }: {
  onCreateBuild: () => void;
  onOpenProjects: () => void;
  runningProjects: Array<{
    agent: Agent;
    projectName: string;
    time: string;
  }>;
}) {
  const hasRunning = runningProjects.length > 0;

  return (
    <View style={styles.runningProjectsPanel}>
      <View style={styles.runningProjectsHeader}>
        <View style={styles.runningProjectsTitleBlock}>
          <Text style={styles.runningProjectsKicker}>Live builds</Text>
          <Text style={styles.runningProjectsTitle}>{hasRunning ? "In motion now" : "Quiet for now"}</Text>
        </View>
        <Pressable style={styles.runningProjectsOpenButton} onPress={onOpenProjects}>
          <Ionicons name="arrow-forward" color="#DAD3FF" size={18} />
        </Pressable>
      </View>

      <View style={styles.runningProjectsList}>
        {runningProjects.length > 0 ? runningProjects.map((item, index) => (
          <View key={item.agent.id} style={[styles.runningProjectCard, item.agent.state === "waiting" ? styles.runningProjectCardWaiting : styles.runningProjectCardRunning]}>
            <View style={styles.runningProjectTop}>
              <View style={[styles.runningProjectIcon, item.agent.state === "waiting" ? styles.runningProjectIconWaiting : null]}>
                <Ionicons name={item.agent.state === "waiting" ? "hourglass-outline" : "pulse-outline"} color={item.agent.state === "waiting" ? "#78F0A4" : "#C894FF"} size={20} />
              </View>
              <View style={styles.runningProjectCopy}>
                <Text numberOfLines={1} style={styles.runningProjectName}>{item.projectName}</Text>
                <Text numberOfLines={1} style={styles.runningProjectTask}>{item.agent.title}</Text>
              </View>
              <View style={[styles.runningProjectSignal, item.agent.state === "waiting" ? styles.runningProjectSignalWaiting : null]}>
                <Text style={[styles.runningProjectTime, item.agent.state === "waiting" ? styles.runningProjectTimeWaiting : null]}>{item.time}</Text>
                {item.agent.state === "waiting" ? null : <RunningProjectGraph progress={item.agent.progress} />}
              </View>
            </View>
            {item.agent.state === "waiting" ? null : (
              <View style={styles.runningProjectBeamTrack}>
                <LinearGradient
                  colors={["#8D25FF", "#C836FF", "#F2C4FF"]}
                  start={{ x: 0, y: 0.5 }}
                  end={{ x: 1, y: 0.5 }}
                  style={[styles.runningProjectBeamFill, { width: `${Math.max(0, Math.min(item.agent.progress, 100))}%` }]}
                />
              </View>
            )}
          </View>
        )) : (
          <View style={styles.runningProjectsEmpty}>
            <View style={styles.runningProjectsEmptyGlow} />
            <View style={styles.runningProjectsEmptyIcon}>
              <Ionicons name="sparkles-outline" color="#DDBBFF" size={24} />
            </View>
            <View style={styles.runningProjectsEmptyCopy}>
              <Text style={styles.runningProjectsEmptyTitle}>No active builds</Text>
              <Text style={styles.runningProjectsEmptyText}>Your running prompts will appear here.</Text>
            </View>
            <Pressable style={({ pressed }) => [styles.runningProjectsEmptyButton, pressed ? styles.runningProjectsEmptyButtonPressed : null]} onPress={onCreateBuild}>
              <LinearGradient
                colors={["#7C2DFF", "#AA35FF", "#6C22E8"]}
                start={{ x: 0, y: 0.5 }}
                end={{ x: 1, y: 0.5 }}
                style={styles.runningProjectsEmptyButtonGradient}
              >
                <Ionicons name="add" color={colors.text} size={18} />
                <Text style={styles.runningProjectsEmptyButtonText}>Create your first build</Text>
              </LinearGradient>
            </Pressable>
          </View>
        )}
      </View>
    </View>
  );
}

export function RunningProjectGraph({ progress }: { progress: number }) {
  const normalized = Math.max(0, Math.min(progress, 100));
  const finalX = 18 + (normalized / 100) * 67;
  const graphPath = `M2 32 C8 32 8 25 14 25 C20 25 19 18 25 18 C31 18 31 23 37 23 C43 23 43 16 49 16 C55 16 55 20 61 20 C67 20 67 13 73 13 C79 13 80 9 86 7`;
  const progressPath = `M2 32 C8 32 8 25 14 25 C20 25 19 18 25 18 C31 18 31 23 37 23 C43 23 43 16 49 16 C55 16 55 20 61 20 C67 20 67 13 73 13 C79 13 80 9 86 7`;
  return (
    <View style={styles.runningProjectGraph}>
      <Svg height="48" viewBox="0 0 88 44" width="102">
        <Defs>
          <SvgGradient id="buildGraphGradient" x1="0" x2="1" y1="0" y2="0">
            <Stop offset="0" stopColor="#8C2AFF" />
            <Stop offset="0.55" stopColor="#C63BFF" />
            <Stop offset="1" stopColor="#F3B2FF" />
          </SvgGradient>
        </Defs>
        <Path d={graphPath} fill="none" opacity={0.2} stroke="#9E41F4" strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} />
        <Path d={progressPath} fill="none" opacity={0.7} stroke="url(#buildGraphGradient)" strokeLinecap="round" strokeLinejoin="round" strokeDasharray={`${Math.max(10, normalized * 1.4)} 160`} strokeWidth={2.1} />
        <Path d={`M${finalX} ${Math.max(7, 32 - normalized * 0.25)} L86 7`} fill="none" opacity={normalized > 82 ? 0.55 : 0} stroke="#F3B2FF" strokeLinecap="round" strokeWidth={2} />
      </Svg>
    </View>
  );
}

export function HomeAction({ icon, label, meta, badge, onPress }: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  meta?: string;
  badge?: string;
  onPress: () => void;
}) {
  return (
    <Pressable style={({ pressed }) => [styles.homeAction, pressed ? styles.homeActionPressed : null]} onPress={onPress}>
      <View style={styles.homeActionTop}>
        <View style={styles.homeActionIcon}>
          <Ionicons name={icon} color="#D9D0FF" size={21} />
        </View>
        <Ionicons name="chevron-forward" color="#817A9E" size={19} />
      </View>
      <Text style={styles.homeActionLabel}>{label}</Text>
      {badge ? <Text style={styles.homeActionBadge}>{badge} saved</Text> : null}
      {meta ? <Text style={styles.homeActionMeta}>{meta}</Text> : null}
    </Pressable>
  );
}

