import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator, Animated, Image, ImageBackground, KeyboardAvoidingView, Linking, Modal,
  NativeScrollEvent, NativeSyntheticEvent, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
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
import { RichMessageText } from "./index";

export function MessageBubble({ message, onOpenApp }: { message: ChatMessage; onOpenApp?: (app: GeneratedApp) => void }) {
  const user = message.role === "user";
  const isThinking = !user && message.text === "Working on it...";
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(8)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 260, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 0, duration: 320, useNativeDriver: true })
    ]).start();
  }, [opacity, translateY]);

  return (
    <Animated.View style={[styles.messageRow, user ? styles.messageRowUser : styles.messageRowAssistant, { opacity, transform: [{ translateY }] }]}>
      <View style={[styles.messageAvatar, user ? styles.messageAvatarUser : styles.messageAvatarAssistant]}>
        {user ? (
          <Ionicons name="person" color="#FFFFFF" size={14} />
        ) : (
          <Image resizeMode="contain" source={vibyraLogo} style={styles.messageAvatarLogo as ImageStyle} />
        )}
      </View>
      <View style={styles.messageContent}>
        <Text style={styles.messageAuthor}>{user ? "You" : "Vibyra"}</Text>
        {message.file ? <Text numberOfLines={1} style={styles.messageFile}>{message.file}</Text> : null}
        {isThinking ? (
          <TypingIndicator />
        ) : (
          <RichMessageText text={message.text} />
        )}
        {message.app && onOpenApp ? <AppPreviewCard app={message.app} onOpen={onOpenApp} /> : null}
      </View>
    </Animated.View>
  );
}

export function TypingIndicator() {
  const dot1 = useRef(new Animated.Value(0)).current;
  const dot2 = useRef(new Animated.Value(0)).current;
  const dot3 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const sequence = (value: Animated.Value, delay: number) => Animated.loop(
      Animated.sequence([
        Animated.timing(value, { toValue: 1, duration: 360, delay, useNativeDriver: true }),
        Animated.timing(value, { toValue: 0, duration: 360, useNativeDriver: true })
      ])
    );
    const animation = Animated.parallel([
      sequence(dot1, 0),
      sequence(dot2, 140),
      sequence(dot3, 280)
    ]);
    animation.start();
    return () => animation.stop();
  }, [dot1, dot2, dot3]);

  const dotStyle = (value: Animated.Value) => ({
    opacity: value.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }),
    transform: [{ translateY: value.interpolate({ inputRange: [0, 1], outputRange: [0, -3] }) }]
  });

  return (
    <View style={styles.typingIndicator}>
      <Animated.View style={[styles.typingDot, dotStyle(dot1)]} />
      <Animated.View style={[styles.typingDot, dotStyle(dot2)]} />
      <Animated.View style={[styles.typingDot, dotStyle(dot3)]} />
    </View>
  );
}

export function AppPreviewCard({ app, onOpen }: { app: GeneratedApp; onOpen: (app: GeneratedApp) => void }) {
  return (
    <Pressable onPress={() => onOpen(app)} style={styles.appPreviewCard}>
      <LinearGradient
        colors={["#8E3CFF", "#5D24D8"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.appPreviewIcon}
      >
        <Ionicons name="play" color="#FFFFFF" size={20} />
      </LinearGradient>
      <View style={styles.appPreviewBody}>
        <Text style={styles.appPreviewLabel}>Runnable preview</Text>
        <Text numberOfLines={1} style={styles.appPreviewTitle}>{app.title}</Text>
        <Text numberOfLines={1} style={styles.appPreviewHint}>Tap to open the app inside Vibyra</Text>
      </View>
      <View style={styles.appPreviewArrow}>
        <Ionicons name="chevron-forward" color="#C9C2D6" size={18} />
      </View>
    </Pressable>
  );
}

export function AppPreviewModal({ app, onClose }: { app: GeneratedApp | null; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (app) setReloadKey(0);
  }, [app?.id]);

  if (!app) return null;

  return (
    <Modal animationType="slide" presentationStyle="fullScreen" visible onRequestClose={onClose}>
      <View style={[styles.appModalScreen, { paddingTop: insets.top }]}>
        <View style={styles.appModalHeader}>
          <Pressable onPress={onClose} style={styles.appModalIconButton}>
            <Ionicons name="close" color="#FFFFFF" size={22} />
          </Pressable>
          <View style={styles.appModalTitleStack}>
            <Text style={styles.appModalLabel}>Vibyra preview</Text>
            <Text numberOfLines={1} style={styles.appModalTitle}>{app.title}</Text>
          </View>
          <Pressable onPress={() => setReloadKey((k) => k + 1)} style={styles.appModalIconButton}>
            <Ionicons name="refresh" color="#FFFFFF" size={20} />
          </Pressable>
        </View>
        <View style={styles.appModalWebContainer}>
          <AppWebView html={app.html} reloadKey={reloadKey} style={styles.appModalWebView} />
        </View>
      </View>
    </Modal>
  );
}

