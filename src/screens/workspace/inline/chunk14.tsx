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
import { formatCommunityTitle, getCommunitySeedComments } from "./chunk15";
import { CommunityAppLogo, CommunityAuthorAvatar } from "./chunk16";
import { CommunityPreview } from "./chunk17";

export function CommunityPostDetail({
  addedComments,
  bookmarked,
  canComment,
  commentCount,
  commentDraft,
  commentError,
  commentPosting,
  liked,
  onAddComment,
  onCommentDraftChange,
  onOpen,
  onToggleBookmark,
  onToggleLike,
  opened,
  post
}: {
  addedComments: CommunityComment[];
  bookmarked: boolean;
  canComment: boolean;
  commentCount: number;
  commentDraft: string;
  commentError: string;
  commentPosting: boolean;
  liked: boolean;
  onAddComment: () => void;
  onCommentDraftChange: (text: string) => void;
  onOpen: () => void;
  onToggleBookmark: () => void;
  onToggleLike: () => void;
  opened: boolean;
  post: CommunityPost;
}) {
  const [activeTab, setActiveTab] = useState<CommunityDetailTab>("about");
  const comments = [...getCommunitySeedComments(post), ...addedComments];
  const canPostComment = canComment && commentDraft.trim().length > 0 && !commentPosting;

  return (
    <View style={styles.communityDetailScreen}>
      <View style={styles.communityDetailIdentity}>
        <View style={styles.communityDetailTitleBlock}>
          <Text style={styles.communityDetailKicker}>{post.tag} app</Text>
          <Text numberOfLines={2} style={styles.communityDetailTitle}>{formatCommunityTitle(post.title)}</Text>
          <Text style={styles.communityDetailDescription}>{post.description}</Text>
        </View>
        <CommunityAppLogo accent={communityDetailAccent} post={post} size={76} />
      </View>

      <View style={styles.communityDetailMakerLine}>
        <CommunityAuthorAvatar accent={communityDetailAccent} name={post.user} size={44} />
        <View style={styles.communityMakerCopy}>
          <Text style={styles.communityMakerName}>{post.user}</Text>
        </View>
      </View>

      <View style={styles.communityDetailActions}>
        <Pressable style={styles.communityPrimaryOpenButton} onPress={onOpen}>
          <LinearGradient
            colors={[communityDetailAccentDark, communityDetailAccent]}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={styles.communityPrimaryOpenGradient}
          >
            <Ionicons name={opened ? "checkmark-circle" : "open-outline"} color={colors.text} size={25} />
            <Text style={styles.communityPrimaryOpenText}>{opened ? "Opened" : "Open app"}</Text>
          </LinearGradient>
        </Pressable>
        <Pressable style={styles.communitySmallAction} onPress={onToggleBookmark}>
          <Ionicons name={bookmarked ? "bookmark" : "bookmark-outline"} color={colors.text} size={24} />
          <Text style={styles.communitySmallActionText}>{bookmarked ? "Saved" : "Save"}</Text>
        </Pressable>
        <Pressable style={styles.communityLikeButton} onPress={onToggleLike}>
          <Ionicons name={liked ? "heart" : "heart-outline"} color={liked ? "#FF6B9A" : colors.text} size={25} />
          <Text style={styles.communityDetailIconText}>{post.likes}</Text>
        </Pressable>
      </View>

      <View style={styles.communityDetailDivider} />

      <View style={styles.communityDetailTabs}>
        {(["about", "comments"] as CommunityDetailTab[]).map((tab) => {
          const active = activeTab === tab;
          return (
            <Pressable key={tab} style={[styles.communityDetailTab, active ? styles.communityDetailTabActive : null]} onPress={() => setActiveTab(tab)}>
              <Text style={[styles.communityDetailTabText, active ? styles.communityDetailTabTextActive : null]}>
                {tab === "about" ? "About" : `Comments ${commentCount}`}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {activeTab === "about" ? (
        <View style={styles.communityTabPanel}>
          <View style={styles.communityDetailScreenshots}>
            <Text style={styles.communityDetailPanelTitle}>Screenshots</Text>
            <View style={styles.communityScreenshotGrid}>
              {post.screenshots.map((screenshot, index) => (
                <View key={screenshot} style={styles.communityScreenshotPreview}>
                  {post.screenshotUrls?.[index]
                    ? <Image source={{ uri: post.screenshotUrls[index] }} style={{ borderRadius: 14, height: "100%", width: "100%" }} />
                    : <CommunityPreview tone={post.accent} type={post.preview} />}
                  <Text numberOfLines={1} style={styles.communityScreenshotLabel}>{screenshot}</Text>
                </View>
              ))}
            </View>
          </View>

          <View style={styles.communityAboutBlock}>
            <Text style={styles.communityDetailPanelTitle}>About this app</Text>
            <Text style={styles.communityDetailPanelBody}>{post.about}</Text>
          </View>
        </View>
      ) : (
        <View style={styles.communityCommentSection}>
          <View style={styles.communityCommentHeader}>
            <Text style={styles.communityDetailPanelTitle}>Comments</Text>
            <Text style={styles.communityCommentCount}>{commentCount}</Text>
          </View>
          <View style={styles.communityCommentComposer}>
            <TextInput
              editable={canComment}
              multiline
              onChangeText={onCommentDraftChange}
              placeholder={canComment ? "Add a comment..." : "Log in to comment"}
              placeholderTextColor="#8F8A9E"
              style={styles.communityCommentInput}
              value={commentDraft}
            />
            <Pressable
              disabled={!canPostComment}
              onPress={onAddComment}
              style={[styles.communityCommentPostButton, !canPostComment ? styles.communityCommentPostButtonDisabled : null]}
            >
              {commentPosting ? <ActivityIndicator color={colors.text} size="small" /> : <Ionicons name="send" color={colors.text} size={17} />}
              <Text style={styles.communityCommentPostText}>{commentPosting ? "Checking" : "Post"}</Text>
            </Pressable>
          </View>
          {commentError ? (
            <View style={styles.communityCommentError}>
              <Ionicons name="alert-circle-outline" color="#FFB4C1" size={18} />
              <Text style={styles.communityCommentErrorText}>{commentError}</Text>
            </View>
          ) : null}
          {comments.map((comment) => (
            <View key={comment.id} style={styles.communityCommentRow}>
              <CommunityAuthorAvatar accent={communityDetailAccent} name={comment.name} size={36} />
              <View style={styles.communityCommentCopy}>
                <View style={styles.communityCommentNameRow}>
                  <Text style={styles.communityCommentName}>{comment.name}</Text>
                  <Text style={styles.communityCommentTime}>{comment.time}</Text>
                </View>
                <Text style={styles.communityCommentText}>{comment.text}</Text>
              </View>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}
