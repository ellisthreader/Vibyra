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
import { chatModelGroups, chatModelOptions, modelLockedForTiers, modelTierFor, planAllowedTiers, providerLogoSources } from "../data/chatModels";
import { COMMUNITY_COMMENTS_KEY, communityDetailAccent, communityDetailAccentDark, communityPosts } from "../data/community";
import { chatSuggestions, pages, previousChats, projectFilterModes, projectStatuses, tokenMembership } from "../data/pages";
import { styles } from "../styles";
import type { ChatModelOption, ChatModelProvider, CommunityComment, CommunityDetailTab, CommunityFilter, CommunityLogoKind, CommunityPost, CommunityPreviewKind, DashboardPage, DesktopCandidate, ProjectDisplay, ProjectLayout, SettingsTab } from "../types";
import { ClaudeLogo } from "./index";

export function ModelMenuRow({
  accountPlan,
  model,
  onSelect,
  onUpgrade,
  selected
}: {
  accountPlan: string;
  model: ChatModelOption;
  onSelect: (model: ChatModelOption) => void;
  onUpgrade?: (model: ChatModelOption) => void;
  selected: boolean;
}) {
  const locked = isModelLockedForPlan(model, accountPlan);
  const lockInfo = locked ? modelLockReason(model) : null;

  return (
    <Pressable
      onPress={() => (locked ? onUpgrade?.(model) : onSelect(model))}
      style={[
        styles.chatModelRow,
        selected ? styles.chatModelRowActive : null,
        locked ? styles.chatModelRowLocked : null
      ]}
    >
      <ModelProviderIcon provider={model.provider} />
      <Text numberOfLines={1} style={styles.chatModelName}>{model.label}</Text>
      {model.badge ? <Text style={styles.chatModelBadge}>{model.badge}</Text> : null}
      {locked && lockInfo ? (
        <View style={styles.chatModelLockPill}>
          <Ionicons name="lock-closed" color="#C9C2D6" size={11} />
          <Text style={styles.chatModelLockText}>{lockInfo.label}</Text>
        </View>
      ) : null}
      {selected ? <Ionicons name="checkmark" color="#7CF1B3" size={18} /> : null}
    </Pressable>
  );
}

export function getUnlockedInitialChatModel(selectedModel: ModelKey, accountPlan: string, preferredModel?: string) {
  const preferred = preferredModel ? chatModelOptions.find((model) => model.key === preferredModel) : null;
  if (preferred && !isModelLockedForPlan(preferred, accountPlan)) return preferred.key;

  const selected = chatModelOptions.find((model) => model.modelKey === selectedModel || model.key === selectedModel);
  if (selected && !isModelLockedForPlan(selected, accountPlan)) return selected.key;
  return "gpt-5.4-mini";
}

export function isModelLockedForPlan(model: ChatModelOption, accountPlan: string, allowedTiers?: string[]) {
  const tiers = (allowedTiers && allowedTiers.length > 0)
    ? allowedTiers
    : planAllowedTiers[accountPlan.toLowerCase()] ?? planAllowedTiers.free;
  return modelLockedForTiers(model, tiers);
}

export function modelLockReason(model: ChatModelOption): { label: string; tier: string } {
  return { label: "Upgrade", tier: modelTierFor(model) };
}

export function LowCreditsWarning({ onOpenTokens, percentRemaining }: {
  onOpenTokens: () => void;
  percentRemaining: number;
}) {
  return (
    <View style={styles.lowCreditsCard}>
      <View style={styles.lowCreditsIcon}>
        <Ionicons name="flash" color="#FFF200" size={20} />
      </View>
      <View style={styles.lowCreditsCopy}>
        <Text style={styles.lowCreditsTitle}>Credits are running low</Text>
        <Text style={styles.lowCreditsText}>{Math.max(0, percentRemaining)}% remaining. Top up soon to keep AI chat flowing.</Text>
      </View>
      <Pressable style={styles.lowCreditsButton} onPress={onOpenTokens}>
        <Text style={styles.lowCreditsButtonText}>View</Text>
      </Pressable>
    </View>
  );
}

export function ChatEmptyState() {
  return (
    <View style={styles.chatEmptyState}>
      <ChatWelcomeGlyph />
      <Text style={styles.chatWelcomeTitle}>How can I help you build today?</Text>
      <Text style={styles.chatWelcomeSubtitle}>Ask anything about your project, code, ideas, or problems.</Text>
      <View style={styles.chatSuggestionGrid}>
        {chatSuggestions.map((suggestion) => (
          <Pressable key={suggestion.title} style={styles.chatSuggestionCard}>
            <Ionicons name={suggestion.icon} color="#8B35FF" size={28} style={styles.chatSuggestionIconGlyph} />
            <Text numberOfLines={2} style={styles.chatSuggestionTitle}>{suggestion.title}</Text>
            <Text numberOfLines={3} style={styles.chatSuggestionDescription}>{suggestion.description}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

export function ChatWelcomeGlyph() {
  return (
    <View style={[styles.chatWelcomeGlyph, { pointerEvents: "none" }]}>
      <Image resizeMode="contain" source={aiChatGlyph} style={styles.chatWelcomeGlyphImage as ImageStyle} />
    </View>
  );
}

export function ModelProviderIcon({ compact, provider }: { compact?: boolean; provider: ChatModelProvider }) {
  const config = {
    auto: { color: "#EDE9FF", icon: "sparkles-outline" as const },
    claude: { color: "#D97757", icon: "sunny-outline" as const },
    openai: { color: "#10A37F", icon: "aperture-outline" as const },
    gemini: { color: "#8EA0FF", icon: "diamond-outline" as const }
  }[provider];
  const logoSource = provider === "openai" || provider === "gemini" ? providerLogoSources[provider] : null;

  return (
    <View style={[
      styles.chatProviderIcon,
      compact ? styles.chatProviderIconCompact : null
    ]}>
      {provider === "claude" ? (
        <ClaudeLogo compact={compact} />
      ) : logoSource ? (
        <Image
          resizeMode="contain"
          source={{ uri: logoSource }}
          style={[
            styles.chatProviderLogo as ImageStyle,
            compact ? styles.chatProviderLogoCompact as ImageStyle : null,
            provider === "openai" ? styles.chatProviderLogoOpenAi as ImageStyle : null
          ]}
        />
      ) : (
        <Ionicons name={config.icon} color={config.color} size={compact ? 14 : 18} />
      )}
    </View>
  );
}
