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
import { CommunityAppLogo } from "./chunk16";

export function CommunityPostCard({ bookmarked, commentCount, liked, onOpen, onToggleBookmark, onToggleLike, post }: {
  bookmarked: boolean;
  commentCount: number;
  liked: boolean;
  onOpen: () => void;
  onToggleBookmark: () => void;
  onToggleLike: () => void;
  post: CommunityPost;
}) {
  return (
    <Pressable style={({ pressed }) => [styles.communityPostCard, pressed ? styles.communityPostCardPressed : null]} onPress={onOpen}>
      <View style={styles.communityPostTop}>
        <CommunityAppLogo post={post} size={48} />
        <View style={styles.communityPostTitleBlock}>
          <Text numberOfLines={1} style={styles.communityPostTitle}>{post.title}</Text>
          <Text numberOfLines={2} style={styles.communityPostDescription}>{post.description}</Text>
        </View>
      </View>

      <View style={styles.communityMakerMiniRow}>
        <View style={[styles.communityMakerMiniAvatar, { backgroundColor: `${post.accent}26` }]}>
          <Text style={[styles.communityMakerMiniAvatarText, { color: post.accent }]}>{post.user.slice(0, 1)}</Text>
        </View>
        <Text numberOfLines={1} style={styles.communityMakerMiniName}>{post.user}</Text>
        <Text style={styles.communityMakerMiniDot}>-</Text>
        <Text style={styles.communityMakerMiniTime}>{post.time}</Text>
      </View>

      <View style={styles.communityPostBottom}>
        <View style={styles.communityPostStats}>
          <Pressable style={styles.communityPostStat} onPress={(event) => {
            event.stopPropagation();
            onToggleLike();
          }}>
            <Ionicons name={liked ? "heart" : "heart-outline"} color={liked ? "#FF6B9A" : "#B7B4C8"} size={17} />
            <Text style={[styles.communityPostStatText, liked ? styles.communityPostStatLiked : null]}>{post.likes}</Text>
          </Pressable>
          <View style={styles.communityPostStat}>
            <Ionicons name="chatbubble-outline" color="#B7B4C8" size={17} />
            <Text style={styles.communityPostStatText}>{commentCount}</Text>
          </View>
        </View>

        <Pressable style={styles.communityPostOpenButton} onPress={(event) => {
          event.stopPropagation();
          onOpen();
        }}>
          <Text style={styles.communityPostOpenText}>View</Text>
        </Pressable>
        <Pressable style={styles.communityBookmark} onPress={(event) => {
          event.stopPropagation();
          onToggleBookmark();
        }}>
          <Ionicons name={bookmarked ? "bookmark" : "bookmark-outline"} color={bookmarked ? post.accent : "#D7D3EA"} size={17} />
        </Pressable>
      </View>
    </Pressable>
  );
}
