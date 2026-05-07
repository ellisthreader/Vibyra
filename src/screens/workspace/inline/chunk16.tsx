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

export function loadCommunityComments(): Record<string, CommunityComment[]> {
  try {
    if (typeof globalThis.localStorage === "undefined") return {};
    const raw = globalThis.localStorage.getItem(COMMUNITY_COMMENTS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return Object.fromEntries(Object.entries(parsed).map(([postId, value]) => [
      postId,
      normalizeCommunityComments(value)
    ]).filter(([, comments]) => comments.length > 0));
  } catch {
    return {};
  }
}

export function saveCommunityComments(commentsByPostId: Record<string, CommunityComment[]>) {
  try {
    if (typeof globalThis.localStorage === "undefined") return;
    globalThis.localStorage.setItem(COMMUNITY_COMMENTS_KEY, JSON.stringify(commentsByPostId));
  } catch {
    // Community comments should remain usable even if local persistence is unavailable.
  }
}

export function normalizeCommunityComments(value: unknown): CommunityComment[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item): CommunityComment | null => {
      if (!item || typeof item !== "object") return null;
      const comment = item as Partial<CommunityComment>;
      const id = String(comment.id ?? "").trim();
      const text = String(comment.text ?? "").trim();
      if (!id || !text) return null;
      return {
        id,
        name: String(comment.name ?? "You").trim() || "You",
        text,
        time: String(comment.time ?? "Just now").trim() || "Just now"
      };
    })
    .filter((comment): comment is CommunityComment => Boolean(comment))
    .slice(-100);
}

export function CommunityAuthorAvatar({ accent, name, size }: { accent: string; name: string; size: number }) {
  return (
    <LinearGradient
      colors={[`${accent}4D`, "rgba(126, 72, 255, 0.24)", "rgba(255, 255, 255, 0.07)"]}
      style={[
        styles.communityAuthorAvatar,
        { borderColor: `${accent}73`, borderRadius: size / 2, height: size, width: size }
      ]}
    >
      <Text style={[styles.communityAuthorAvatarText, { color: colors.text, fontSize: Math.max(11, size * 0.36) }]}>{name.slice(0, 1)}</Text>
    </LinearGradient>
  );
}

export function CommunityAppLogo({ accent, post, size }: { accent?: string; post: CommunityPost; size: number }) {
  const logo = (post.logo ?? "default") as CommunityLogoKind;
  const radius = Math.round(size * 0.26);
  const tone = accent ?? post.accent;

  return (
    <LinearGradient
      colors={[`${tone}E6`, `${tone}78`, "rgba(255, 255, 255, 0.18)"]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.communityGeneratedLogo, { borderRadius: radius, height: size, width: size }]}
    >
      <View style={[styles.communityGeneratedLogoInner, { borderRadius: Math.max(8, radius - 6) }]}>
        {logo === "invoice" ? (
          <>
            <View style={[styles.communityInvoicePage, { height: size * 0.54, width: size * 0.38 }]}>
              <View style={[styles.communityInvoiceLine, { width: "66%" }]} />
              <View style={[styles.communityInvoiceLine, { opacity: 0.62, width: "86%" }]} />
              <View style={[styles.communityInvoiceLine, { opacity: 0.42, width: "54%" }]} />
            </View>
            <View style={[styles.communityInvoiceCoin, { height: size * 0.2, right: size * 0.18, top: size * 0.18, width: size * 0.2 }]} />
          </>
        ) : null}

        {logo === "habit" ? (
          <>
            <View style={[styles.communityHabitLogoRing, { borderColor: colors.text, height: size * 0.5, width: size * 0.5 }]}>
              <View style={[styles.communityHabitLogoCore, { backgroundColor: tone }]} />
            </View>
            <View style={styles.communityHabitLogoDots}>
              {Array.from({ length: 5 }).map((_, index) => <View key={index} style={[styles.communityHabitLogoDot, index < 3 ? { backgroundColor: colors.text } : null]} />)}
            </View>
          </>
        ) : null}

        {logo === "analytics" ? (
          <View style={styles.communityAnalyticsLogoBars}>
            {[0.36, 0.64, 0.48, 0.78].map((height, index) => (
              <View key={index} style={[styles.communityAnalyticsLogoBar, { backgroundColor: index === 3 ? colors.text : "rgba(255, 255, 255, 0.72)", height: size * height }]} />
            ))}
          </View>
        ) : null}

        {logo === "default" ? (
          <>
            <View style={[styles.communityDefaultLogoOrb, { backgroundColor: colors.text, height: size * 0.24, width: size * 0.24 }]} />
            <View style={[styles.communityDefaultLogoBlade, { backgroundColor: `${tone}CC`, height: size * 0.52, width: size * 0.18 }]} />
            <View style={[styles.communityDefaultLogoBlade, styles.communityDefaultLogoBladeAlt, { height: size * 0.42, width: size * 0.15 }]} />
          </>
        ) : null}
      </View>
    </LinearGradient>
  );
}

