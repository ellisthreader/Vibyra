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
import { ProfileSettingsGroup, formatPlanLabel } from "./index";

export function ProfilePage(props: {
  activeTab: SettingsTab;
  accountPlan: string;
  creditsBalance: number;
  email: string;
  machineName: string;
  name: string;
  onTabChange: (tab: SettingsTab) => void;
  projectCount: number;
  selectedModel: string;
}) {
  const [selectedRow, setSelectedRow] = useState(getProfileRowForTab(props.activeTab));
  const profileEmail = props.email === "you@vibyra.app" || !props.email ? "you@vibyra.app" : props.email;
  const profileName = props.name.trim() || "Vibyra User";
  const profileInitial = profileName.charAt(0).toUpperCase();
  const planLabel = formatPlanLabel(props.accountPlan);

  useEffect(() => {
    setSelectedRow(getProfileRowForTab(props.activeTab));
  }, [props.activeTab]);

  const selectProfileRow = useCallback((label: string) => {
    setSelectedRow(label);
    const tab = getProfileTabForRow(label);
    if (tab) props.onTabChange(tab);
  }, [props]);

  return (
    <View style={styles.profileScreen}>
      <View style={styles.profileHeroCard}>
        <View style={styles.profileHeroTop}>
          <View style={styles.profileAvatarWrap}>
            <View style={styles.profileAvatarLarge}>
              <Text style={styles.profileAvatarLargeText}>{profileInitial}</Text>
            </View>
            <Pressable style={styles.profileAvatarEditButton}>
              <Ionicons name="pencil-outline" color="#E8E2F7" size={18} />
            </Pressable>
          </View>

          <View style={styles.profileSummaryCopy}>
            <Text style={styles.profileSummaryName}>{profileName}</Text>
            <Text style={styles.profileSummaryEmail}>{profileEmail}</Text>
            <View style={styles.profilePlanBadge}>
              <Ionicons name="diamond" color="#C259FF" size={16} />
              <Text style={styles.profilePlanBadgeText}>{planLabel}</Text>
            </View>
          </View>
        </View>

        <View style={styles.profileDivider} />

        <View style={styles.profileUsageStrip}>
          <View style={styles.profileUsageItem}>
            <View style={styles.profileUsageIcon}>
              <Ionicons name="flash" color="#C259FF" size={29} />
            </View>
            <View>
              <Text style={styles.profileUsageValue}>{props.creditsBalance.toLocaleString()}</Text>
              <Text style={styles.profileUsageLabel}>tokens remaining</Text>
            </View>
          </View>
          <View style={styles.profileUsageDivider} />
          <View style={styles.profileUsageItem}>
            <View style={styles.profileUsageIcon}>
              <Ionicons name="calendar-clear-outline" color="#B8B3CB" size={25} />
            </View>
            <View>
              <Text style={styles.profileRenewMeta}>{props.accountPlan === "free" ? "Current plan" : "Renews on"}</Text>
              <Text style={styles.profileRenewDate}>{props.accountPlan === "free" ? "Free trial" : "May 24, 2025"}</Text>
            </View>
          </View>
        </View>
      </View>

      <ProfileSettingsGroup
        activeLabel={selectedRow}
        onSelect={selectProfileRow}
        title="ACCOUNT"
        rows={[
          { icon: "person-outline", label: "Profile information" },
          { icon: "card-outline", label: "Billing & subscription" },
          { icon: "time-outline", label: "Usage & history" },
          { icon: "gift-outline", label: "Refer & earn" }
        ]}
      />

      <ProfileSettingsGroup
        activeLabel={selectedRow}
        onSelect={selectProfileRow}
        title="PREFERENCES"
        rows={[
          { icon: "notifications-outline", label: "Notifications" },
          { icon: "color-palette-outline", label: "Appearance" },
          { icon: "shield-outline", label: "Privacy & security" },
          { icon: "globe-outline", label: "Language", value: "English" }
        ]}
      />

      <ProfileSettingsGroup
        activeLabel={selectedRow}
        onSelect={selectProfileRow}
        title="SUPPORT"
        rows={[
          { icon: "help-circle-outline", label: "Help center" },
          { icon: "chatbubble-outline", label: "Contact support" },
          { icon: "document-text-outline", label: "Terms of service" },
          { danger: true, icon: "log-out-outline", label: "Log out" }
        ]}
      />
    </View>
  );
}

export function getProfileRowForTab(tab: SettingsTab) {
  if (tab === "billing") return "Billing & subscription";
  if (tab === "preferences") return "Appearance";
  if (tab === "security") return "Privacy & security";
  return "Profile information";
}

export function getProfileTabForRow(label: string): SettingsTab | null {
  if (label === "Profile information") return "profile";
  if (label === "Billing & subscription" || label === "Usage & history") return "billing";
  if (label === "Notifications" || label === "Appearance" || label === "Language") return "preferences";
  if (label === "Privacy & security") return "security";
  return null;
}

