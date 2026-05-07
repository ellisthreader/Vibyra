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

export function CommunityPreview({ tone, type }: { tone: string; type: typeof communityPosts[number]["preview"] }) {
  return (
    <View style={[styles.communityPreview, { borderColor: `${tone}66` }]}>
      {type === "invoice" ? (
        <>
          <View style={styles.communityPreviewSidebar}>
            {Array.from({ length: 7 }).map((_, index) => <View key={index} style={[styles.communityPreviewSideDot, index === 1 ? { backgroundColor: tone } : null]} />)}
          </View>
          <View style={styles.communityPreviewContent}>
            <Text style={styles.communityPreviewTiny}>Invoices</Text>
            <Text style={styles.communityPreviewValue}>$24,540</Text>
            <View style={styles.communityBarChart}>
              {[8, 14, 11, 21, 13, 18, 17, 23, 28].map((height, index) => (
                <View key={index} style={[styles.communityChartBar, { height, backgroundColor: index > 6 ? tone : `${tone}B8` }]} />
              ))}
            </View>
            <View style={styles.communityPreviewRows}>
              <View style={styles.communityPreviewRow} />
              <View style={styles.communityPreviewRow} />
              <View style={styles.communityPreviewRowShort} />
            </View>
          </View>
        </>
      ) : null}

      {type === "habit" ? (
        <>
          <View style={styles.communityHabitCard}>
            <View style={[styles.communityHabitRing, { borderColor: tone }]}>
              <Text style={styles.communityHabitScore}>8/10</Text>
            </View>
            <Text style={[styles.communityHabitText, { color: tone }]}>Great job!</Text>
          </View>
          <View style={styles.communityCalendar}>
            {Array.from({ length: 21 }).map((_, index) => (
              <View key={index} style={[styles.communityCalendarDot, index > 6 ? { backgroundColor: `${tone}88` } : null]} />
            ))}
          </View>
        </>
      ) : null}

      {type === "analytics" ? (
        <View style={styles.communityAnalytics}>
          <Text style={styles.communityPreviewTiny}>Overview</Text>
          <View style={styles.communityMetricRow}>
            {["12.4K", "$28.9K", "2.4%"].map((metric, index) => (
              <View key={metric} style={styles.communityMetricCard}>
                <Text style={styles.communityMetricValue}>{metric}</Text>
                <Text style={[styles.communityMetricDelta, index === 2 ? { color: "#FF6480" } : null]}>{index === 2 ? "-3.1%" : "+12.5%"}</Text>
              </View>
            ))}
          </View>
          <View style={styles.communityLineChart}>
            {[12, 24, 17, 32, 21, 35, 27, 44, 33, 50, 41, 58].map((top, index) => (
              <View key={index} style={[styles.communityLinePoint, { left: `${index * 8}%`, top }]} />
            ))}
          </View>
        </View>
      ) : null}
    </View>
  );
}

