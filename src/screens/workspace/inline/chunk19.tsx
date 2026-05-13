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

export function ProfileStat({ icon, label, last, value }: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  last?: boolean;
  value: string;
}) {
  return (
    <View style={[styles.profileStat, last ? styles.profileStatLast : null]}>
      <View style={styles.profileStatIcon}>
        <Ionicons name={icon} color="#D070FF" size={22} />
      </View>
      <View>
        <Text style={styles.profileStatValue}>{value}</Text>
        <Text style={styles.profileStatLabel}>{label}</Text>
      </View>
    </View>
  );
}

export function ProfileSettingsGroup({ activeLabel, onSelect, rows, title }: {
  activeLabel: string;
  onSelect: (label: string) => void;
  rows: Array<{ danger?: boolean; icon: keyof typeof Ionicons.glyphMap; label: string; value?: string; key?: string }>;
  title: string;
}) {
  return (
    <View style={styles.profileSection}>
      <Text style={styles.profileGroupTitle}>{title}</Text>
      <View style={styles.profileGroup}>
        {rows.map((row, index) => {
          const rowKey = row.key ?? row.label;
          const active = activeLabel === rowKey;
          return (
            <Pressable
              key={rowKey}
              onPress={() => onSelect(rowKey)}
              style={({ pressed }) => [
                styles.profileRow,
                index === rows.length - 1 ? styles.profileRowLast : null,
                active ? styles.profileRowActive : null,
                pressed ? styles.profileRowPressed : null
              ]}
            >
              <View style={[styles.profileRowIcon, row.danger ? styles.profileRowIconDanger : null]}>
                <Ionicons name={row.icon} color={row.danger ? "#FF465C" : "#B953FF"} size={23} />
              </View>
              <Text numberOfLines={1} style={[styles.profileRowLabel, row.danger ? styles.profileRowLabelDanger : null]}>{row.label}</Text>
              {row.value ? <Text numberOfLines={1} style={styles.profileRowValue}>{row.value}</Text> : null}
              <Ionicons name="chevron-forward" color="#AAA6BA" size={23} />
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export function PageHeader({ actionIcon, actionLabel, onAction, subtitle, title }: {
  actionIcon?: keyof typeof Ionicons.glyphMap;
  actionLabel?: string;
  onAction?: () => void;
  subtitle?: string;
  title: string;
}) {
  return (
    <View style={styles.pageHeader}>
      <View style={styles.pageHeaderCopy}>
        <Text style={styles.pageTitle}>{title}</Text>
        {subtitle ? <Text style={styles.bodyText}>{subtitle}</Text> : null}
      </View>
      {actionLabel && onAction ? (
        <Pressable style={styles.primaryButton} onPress={onAction}>
          <Ionicons name={actionIcon ?? "add"} color={colors.text} size={18} />
          <Text style={styles.primaryButtonText}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function SectionCard({ action, children, onAction, title }: {
  action?: string;
  children: React.ReactNode;
  onAction?: () => void;
  title: string;
}) {
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {action ? (
          <Pressable onPress={onAction}>
            <Text style={styles.cardAction}>{action}</Text>
          </Pressable>
        ) : null}
      </View>
      {children}
    </View>
  );
}

export function CompactRow({ icon, meta, title, tone = "default" }: {
  icon: keyof typeof Ionicons.glyphMap;
  meta: string;
  title: string;
  tone?: "default" | "green";
}) {
  return (
    <View style={styles.compactRow}>
      <View style={[styles.rowIcon, tone === "green" ? styles.rowIconGreen : null]}>
        <Ionicons name={icon} color={tone === "green" ? "#A7F3D0" : colors.muted} size={18} />
      </View>
      <View style={styles.rowCopy}>
        <Text numberOfLines={1} style={styles.rowTitle}>{title}</Text>
        <Text numberOfLines={1} style={styles.projectMeta}>{meta}</Text>
      </View>
    </View>
  );
}
