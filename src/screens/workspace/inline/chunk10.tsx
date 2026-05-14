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
import { colors } from "../../../styles/theme";
import { usePreferences, useThemedColor } from "../../../context/PreferencesContext";
import type { Agent, ChatMessage, GeneratedApp, ModelKey, Project, RememberedDesktop } from "../../../types/domain";
import { appApiRequest } from "../../../utils/appApi";
import { fetchWithTimeout, normalizeAgentUrl } from "../../../utils/network";
import { aiChatGlyph, chatBuildAiHero, communityHero, dashboardHeroArt, projectsBackdrop, projectsFoldersHero, vibyraLogo } from "../data/assets";
import { chatModelGroups, chatModelOptions, modelLockedForTiers, modelTierFor, planAllowedTiers, providerLogoSources } from "../data/chatModels";
import { COMMUNITY_COMMENTS_KEY, communityDetailAccent, communityDetailAccentDark, communityPosts } from "../data/community";
import { chatSuggestions, pages, previousChats, projectFilterModes, projectStatuses, tokenMembership } from "../data/pages";
import { styles } from "../styles";
import type { ChatModelOption, ChatModelProvider, CommunityComment, CommunityDetailTab, CommunityFilter, CommunityLogoKind, CommunityPost, CommunityPreviewKind, DashboardPage, DesktopCandidate, ProjectDisplay, ProjectLayout, SettingsTab } from "../types";
import { ClaudeLogo } from "./chunk11";

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
  const lockIconColor = useThemedColor("#C9C2D6");
  const checkIconColor = useThemedColor("#7CF1B3");

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
          <Ionicons name="lock-closed" color={lockIconColor} size={11} />
          <Text style={styles.chatModelLockText}>{lockInfo.label}</Text>
        </View>
      ) : null}
      {selected ? <Ionicons name="checkmark" color={checkIconColor} size={18} /> : null}
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
  const warningIconColor = useThemedColor("#FFF200");
  return (
    <View style={styles.lowCreditsCard}>
      <View style={styles.lowCreditsIcon}>
        <Ionicons name="flash" color={warningIconColor} size={20} />
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

export function ChatEmptyState({ onPickSuggestion }: { onPickSuggestion?: (prompt: string) => void }) {
  const prefs = usePreferences();
  const suggestionIconColor = useThemedColor("#D7C4FF");
  const suggestionGradient = prefs.effectiveScheme === "light"
    ? ["rgba(109, 59, 255, 0.12)", "rgba(79, 70, 229, 0.08)"] as const
    : ["rgba(142, 60, 255, 0.32)", "rgba(93, 36, 216, 0.18)"] as const;
  const opacity = useRef(new Animated.Value(0)).current;
  const lift = useRef(new Animated.Value(12)).current;
  const orbPulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 380, useNativeDriver: Platform.OS !== "web" }),
      Animated.timing(lift, { toValue: 0, duration: 420, useNativeDriver: Platform.OS !== "web" })
    ]).start();
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(orbPulse, { toValue: 1, duration: 1800, useNativeDriver: Platform.OS !== "web" }),
        Animated.timing(orbPulse, { toValue: 0, duration: 1800, useNativeDriver: Platform.OS !== "web" })
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [opacity, lift, orbPulse]);

  const orbScale = orbPulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.06] });
  const orbGlow = orbPulse.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] });

  return (
    <Animated.View style={[styles.chatEmptyState, { opacity, transform: [{ translateY: lift }] }]}>
      <Animated.View style={[styles.chatWelcomeGlyph, { pointerEvents: "none", transform: [{ scale: orbScale }], opacity: orbGlow }]}>
        <Image resizeMode="contain" source={aiChatGlyph} style={styles.chatWelcomeGlyphImage as ImageStyle} />
      </Animated.View>
      <Text style={styles.chatWelcomeKicker}>Vibyra AI</Text>
      <Text style={styles.chatWelcomeTitle}>How can I help you build today?</Text>
      <Text style={styles.chatWelcomeSubtle}>Ask anything, edit code, or describe an idea — I'll handle the rest.</Text>
      <View style={styles.chatSuggestionGrid}>
        {chatSuggestions.map((suggestion) => (
          <Pressable
            key={suggestion.title}
            onPress={() => onPickSuggestion?.(suggestion.prompt)}
            style={({ pressed }) => [styles.chatSuggestionCard, pressed && styles.chatSuggestionCardPressed]}
          >
            <View style={styles.chatSuggestionIconPlate}>
              <LinearGradient
                colors={suggestionGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={StyleSheet.absoluteFill}
              />
              <Ionicons name={suggestion.icon} color={suggestionIconColor} size={18} />
            </View>
            <Text numberOfLines={2} style={styles.chatSuggestionTitle}>{suggestion.title}</Text>
            <Text numberOfLines={3} style={styles.chatSuggestionDescription}>{suggestion.description}</Text>
          </Pressable>
        ))}
      </View>
    </Animated.View>
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
  const autoIconColor = useThemedColor("#EDE9FF");
  const geminiIconColor = useThemedColor("#8EA0FF");
  const config = {
    auto: { color: autoIconColor, icon: "sparkles-outline" as const },
    claude: { color: "#D97757", icon: "sunny-outline" as const },
    openai: { color: "#10A37F", icon: "aperture-outline" as const },
    gemini: { color: geminiIconColor, icon: "diamond-outline" as const }
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
