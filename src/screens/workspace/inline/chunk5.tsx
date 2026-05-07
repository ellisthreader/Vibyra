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

export function TokenMembershipSheet({ onClose, onManage, plan, tokenBalance, tokensUsed, visible }: {
  onClose: () => void;
  onManage: () => void;
  plan: string;
  tokenBalance: number;
  tokensUsed: number;
  visible: boolean;
}) {
  const allowance = Math.max(tokenBalance + tokensUsed, plan === "free" ? 50 : tokenMembership.allowance);
  const progress = Math.min(1, tokenBalance / allowance);
  const availablePercent = Math.round((tokenBalance / allowance) * 100);
  const planLabel = formatPlanLabel(plan);

  return (
    <Modal animationType="fade" onRequestClose={onClose} transparent visible={visible}>
      <View style={styles.tokenSheetOverlay}>
        <Pressable accessibilityLabel="Close token membership" style={styles.tokenSheetScrim} onPress={onClose} />
        <View style={styles.tokenSheet}>
          <View style={styles.tokenSheetHandle} />
          <View style={styles.tokenSheetHeader}>
            <View style={styles.tokenSheetHeaderIcon}>
              <Ionicons name="flash" color="#FFF200" size={24} />
            </View>
            <View style={styles.tokenSheetHeaderCopy}>
              <Text style={styles.tokenSheetKicker}>{planLabel} membership</Text>
              <Text numberOfLines={1} style={styles.tokenSheetTitle}>{tokenBalance.toLocaleString()} tokens available</Text>
            </View>
            <Pressable style={styles.tokenSheetClose} onPress={onClose}>
              <Ionicons name="close" color={colors.text} size={21} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.tokenSheetContent} showsVerticalScrollIndicator={false} style={styles.tokenSheetScroll}>
            <View style={styles.tokenHeroPanel}>
              <View style={styles.tokenHeroTop}>
                <View>
                  <Text style={styles.tokenHeroLabel}>Current cycle</Text>
                  <Text style={styles.tokenHeroValue}>{availablePercent}% remaining</Text>
                </View>
                <View style={styles.tokenRenewalBadge}>
                  <Ionicons name="refresh-outline" color="#FFF200" size={15} />
                  <Text style={styles.tokenRenewalText}>{tokenMembership.renewal}</Text>
                </View>
              </View>
              <View style={styles.tokenTrack}>
                <LinearGradient
                  colors={["#FFF200", "#C6FF00", "#8B35FF"]}
                  start={{ x: 0, y: 0.5 }}
                  end={{ x: 1, y: 0.5 }}
                  style={[styles.tokenTrackFill, { width: `${progress * 100}%` }]}
                />
              </View>
            </View>

            <Pressable style={({ pressed }) => [styles.tokenManageButton, pressed ? styles.tokenManageButtonPressed : null]} onPress={onManage}>
              <LinearGradient
                colors={["#5E28D9", "#8B35FF"]}
                start={{ x: 0, y: 0.5 }}
                end={{ x: 1, y: 0.5 }}
                style={styles.tokenManageGradient}
              >
                <Ionicons name="card-outline" color={colors.text} size={20} />
                <Text style={styles.tokenManageText}>Manage membership</Text>
              </LinearGradient>
            </Pressable>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

export function formatPlanLabel(plan: string) {
  const normalized = plan.trim().toLowerCase();
  if (!normalized || normalized === "free") return "Free Plan";
  return `${normalized.charAt(0).toUpperCase()}${normalized.slice(1)} Plan`;
}

export function MobileConnectionCard({ machineName }: { machineName: string }) {
  return (
    <View style={styles.mobileConnectionCard}>
      <View style={styles.statusDot} />
      <View style={styles.mobileConnectionCopy}>
        <Text style={styles.topKicker}>Connected to PC</Text>
        <Text numberOfLines={1} style={styles.statusText}>{machineName}</Text>
      </View>
    </View>
  );
}

