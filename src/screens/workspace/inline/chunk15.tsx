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
import { CommunityAppLogo } from "./index";

export function getCommunitySeedComments(post: CommunityPost): CommunityComment[] {
  const shared = [
    { name: "Iris", text: post.preview === "invoice" ? "The payment follow-up flow feels useful." : "This is clean and easy to understand.", time: "2d ago" },
    { name: "Sam", text: post.preview === "habit" ? "The weekly reflection screen is my favourite bit." : "The screenshots make the app feel ready to try.", time: "3d ago" },
    { name: "Ava", text: "The layout feels polished without being busy.", time: "4d ago" },
    { name: "Ben", text: "I like how quickly the core workflow makes sense.", time: "5d ago" },
    { name: "Nia", text: "This would be useful as a starter template.", time: "6d ago" },
    { name: "Theo", text: "The visual direction is strong and practical.", time: "1w ago" },
    { name: "Mila", text: "Nice balance between simple controls and useful detail.", time: "1w ago" },
    { name: "Owen", text: "The screenshots make me want to try the live version.", time: "1w ago" },
    { name: "Rae", text: "Clear idea, good execution, and easy to scan.", time: "2w ago" }
  ];

  return shared.slice(0, post.comments).map((comment, index) => ({
    id: `${post.id}-seed-${index}`,
    ...comment
  }));
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
  const [analyticsRange, setAnalyticsRange] = useState<"7d" | "30d">("7d");
  const [habitChecked, setHabitChecked] = useState(false);
  const [invoicePaid, setInvoicePaid] = useState(false);

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

      {post.preview === "invoice" ? (
        <View style={styles.communityDemoPanel}>
          <View style={styles.communityDemoTopRow}>
            <View>
              <Text style={styles.communityDemoLabel}>Invoice total</Text>
              <Text style={styles.communityDemoValue}>$2,480</Text>
            </View>
            <Text style={[styles.communityDemoStatus, invoicePaid ? styles.communityDemoStatusDone : null]}>
              {invoicePaid ? "Paid" : "Due today"}
            </Text>
          </View>
          {["Design sprint", "Frontend build", "QA pass"].map((item, index) => (
            <View key={item} style={styles.communityDemoLineItem}>
              <Text style={styles.communityDemoLineText}>{item}</Text>
              <Text style={styles.communityDemoLineAmount}>${[900, 1280, 300][index].toLocaleString()}</Text>
            </View>
          ))}
          <Pressable style={styles.communityDemoAction} onPress={() => setInvoicePaid((paid) => !paid)}>
            <Ionicons name={invoicePaid ? "refresh-outline" : "checkmark-circle-outline"} color={colors.text} size={20} />
            <Text style={styles.communityDemoActionText}>{invoicePaid ? "Reset invoice" : "Mark as paid"}</Text>
          </Pressable>
        </View>
      ) : null}

      {post.preview === "habit" ? (
        <View style={styles.communityDemoPanel}>
          <View style={styles.communityHabitDemoTop}>
            <View style={[styles.communityHabitDemoRing, habitChecked ? styles.communityHabitDemoRingDone : null]}>
              <Text style={styles.communityHabitDemoScore}>{habitChecked ? "9/10" : "8/10"}</Text>
            </View>
            <View style={styles.communityHabitDemoCopy}>
              <Text style={styles.communityDemoLabel}>Today</Text>
              <Text style={styles.communityDemoValue}>{habitChecked ? "Completed" : "One habit left"}</Text>
            </View>
          </View>
          <View style={styles.communityHabitDemoGrid}>
            {Array.from({ length: 21 }).map((_, index) => (
              <View key={index} style={[styles.communityHabitDemoDot, index < (habitChecked ? 18 : 16) ? styles.communityHabitDemoDotDone : null]} />
            ))}
          </View>
          <Pressable style={styles.communityDemoAction} onPress={() => setHabitChecked((checked) => !checked)}>
            <Ionicons name={habitChecked ? "remove-circle-outline" : "add-circle-outline"} color={colors.text} size={20} />
            <Text style={styles.communityDemoActionText}>{habitChecked ? "Undo check-in" : "Check in"}</Text>
          </Pressable>
        </View>
      ) : null}

      {post.preview === "analytics" ? (
        <View style={styles.communityDemoPanel}>
          <View style={styles.communityAnalyticsDemoHeader}>
            <View>
              <Text style={styles.communityDemoLabel}>MRR</Text>
              <Text style={styles.communityDemoValue}>{analyticsRange === "7d" ? "$28.9K" : "$34.2K"}</Text>
            </View>
            <View style={styles.communityAnalyticsRange}>
              {(["7d", "30d"] as const).map((range) => (
                <Pressable key={range} style={[styles.communityAnalyticsRangeOption, analyticsRange === range ? styles.communityAnalyticsRangeOptionActive : null]} onPress={() => setAnalyticsRange(range)}>
                  <Text style={[styles.communityAnalyticsRangeText, analyticsRange === range ? styles.communityAnalyticsRangeTextActive : null]}>{range}</Text>
                </Pressable>
              ))}
            </View>
          </View>
          <View style={styles.communityAnalyticsBars}>
            {(analyticsRange === "7d" ? [46, 62, 54, 78, 66, 88, 94] : [36, 44, 58, 52, 68, 74, 82]).map((height, index) => (
              <View key={index} style={[styles.communityAnalyticsDemoBar, { height }]} />
            ))}
          </View>
        </View>
      ) : null}
    </View>
  );
}

export function formatCommunityTitle(title: string) {
  return title.replace(/\b\w/g, (letter) => letter.toUpperCase()).replace(/\bAi\b/g, "AI").replace(/\bSaas\b/g, "SaaS");
}

