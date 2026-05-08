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

export function ChatPreviewCard({ active, chat, onOpen }: {
  active: boolean;
  chat: typeof previousChats[number];
  onOpen: () => void;
}) {
  const status = chat.running ? "Running" : "Not running";

  return (
    <Pressable style={[styles.projectCard, active ? styles.projectCardActive : null]} onPress={onOpen}>
      <View style={styles.projectCardMain}>
        <View style={[styles.projectIcon, active ? styles.projectIconActive : chat.running ? styles.chatPreviewIconRunning : null]}>
          <Ionicons name={chat.icon} color={chat.running ? "#59E8A0" : active ? "#59E8A0" : "#DAD6F6"} size={24} />
        </View>
        <View style={styles.projectCardCopy}>
          <View style={styles.projectTitleRow}>
            <Text numberOfLines={1} style={styles.projectName}>{chat.title}</Text>
            <View style={[styles.projectTitleDot, { backgroundColor: chat.running ? "#3CD783" : "#373B52" }]} />
          </View>
          <Text numberOfLines={1} style={styles.projectMeta}>{chat.meta}</Text>
          <View style={styles.projectStackRow}>
            <View style={styles.projectStackDot} />
            <Text numberOfLines={1} style={styles.projectStack}>{chat.running ? "Agent is currently working in this chat" : "Ready to continue"}</Text>
          </View>
        </View>
        <View style={styles.projectCardRight}>
          <Text style={[styles.projectStatusPill, active || chat.running ? styles.projectStatusActive : null]}>{status}</Text>
          <Ionicons name="chevron-forward" color="#A9A6BE" size={21} />
        </View>
      </View>

      <View style={styles.projectDivider} />

      <View style={styles.projectCardFooter}>
        <View style={styles.projectFooterDetails}>
          <View style={styles.projectFooterMeta}>
            <Ionicons name="chatbubble-ellipses-outline" color="#AAA6BC" size={15} />
            <Text numberOfLines={1} style={styles.projectFooterText}>AI conversation</Text>
          </View>
          <View style={styles.projectFooterMeta}>
            <Ionicons name={chat.running ? "pulse-outline" : "pause-circle-outline"} color="#AAA6BC" size={15} />
            <Text numberOfLines={1} style={styles.projectFooterText}>{status}</Text>
          </View>
        </View>
        <View style={styles.projectFooterActions}>
          <View style={styles.projectOpenButton}>
            <LinearGradient
              colors={["#6E31FF", "#5624E6"]}
              start={{ x: 0, y: 0.5 }}
              end={{ x: 1, y: 0.5 }}
              style={styles.projectOpenGradient}
            >
              <Text style={styles.projectOpenText}>Open</Text>
              <Ionicons name="arrow-forward" color={colors.text} size={17} />
            </LinearGradient>
          </View>
        </View>
      </View>
    </Pressable>
  );
}

export function ChatLandingArt() {
  return (
    <View style={[styles.chatLandingArt, { pointerEvents: "none" }]}>
      <Image resizeMode="contain" source={chatBuildAiHero} style={styles.chatLandingArtImage as ImageStyle} />
    </View>
  );
}

export function ChatLandingRow({ active, chat, onOpen }: {
  active: boolean;
  chat: typeof previousChats[number];
  onOpen: () => void;
}) {
  return (
    <Pressable style={[styles.chatRecentRow, active ? styles.chatRecentRowActive : null]} onPress={onOpen}>
      {active ? <View style={styles.chatRecentActiveDot} /> : null}
      <View style={[styles.chatRecentIcon, chat.running ? styles.chatRecentIconRunning : null]}>
        <Ionicons name={chat.icon} color={chat.running ? "#55F09C" : "#BDB7D6"} size={21} />
      </View>
      <View style={styles.chatRecentCopy}>
        <Text numberOfLines={1} style={styles.chatRecentRowTitle}>{chat.title}</Text>
        <View style={styles.chatRecentMetaRow}>
          <View style={[styles.chatStatusDot, chat.running ? styles.chatStatusDotRunning : null]} />
          <Text style={[styles.chatRecentMeta, chat.running ? styles.chatRecentMetaRunning : null]}>{chat.running ? "Running" : "Not running"}</Text>
          <Text style={styles.chatRecentMeta}>·</Text>
          <Text numberOfLines={1} style={styles.chatRecentMeta}>{chat.meta}</Text>
          <Text style={styles.chatRecentMeta}>·</Text>
          <Text numberOfLines={1} style={styles.chatRecentMeta}>{chat.detail}</Text>
        </View>
      </View>
      <Text style={styles.chatRecentTime}>{chat.time}</Text>
      <Ionicons name="chevron-forward" color="#B8B0D0" size={24} />
    </Pressable>
  );
}
