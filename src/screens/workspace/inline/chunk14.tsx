import React from "react";
import { ActivityIndicator, Image, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { colors } from "../../../styles/theme";
import { communityDetailAccent, communityDetailAccentDark } from "../data/community";
import { styles } from "../styles";
import type { CommunityComment, CommunityPost } from "../types";
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
  onReport,
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
  onToggleBookmark: () => void;
  onOpen: () => void;
  onReport: () => void;
  onToggleLike: () => void;
  opened: boolean;
  post: CommunityPost;
}) {
  const comments = [...getCommunitySeedComments(post), ...addedComments];
  const visibleComments = comments.slice(0, 4);
  const canPostComment = canComment && commentDraft.trim().length > 0 && !commentPosting;

  return (
    <View style={styles.communityDetailScreen}>
      <View style={styles.communityDetailIdentity}>
        <View style={styles.communityDetailTitleBlock}>
          <Text style={styles.communityDetailKicker}>{post.tag} app</Text>
          <Text numberOfLines={2} style={styles.communityDetailTitle}>{formatCommunityTitle(post.title)}</Text>
          <Text numberOfLines={2} style={styles.communityDetailDescription}>{post.description}</Text>
        </View>
        <CommunityAppLogo accent={communityDetailAccent} post={post} size={72} />
      </View>

      <View style={styles.communityDetailMakerLine}>
        <CommunityAuthorAvatar accent={communityDetailAccent} name={post.user} size={38} />
        <View style={styles.communityMakerCopy}>
          <Text style={styles.communityMakerName}>{post.user}</Text>
          <Text style={styles.communityMakerMiniTime}>{post.time}</Text>
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
            <Ionicons name={opened ? "checkmark-circle" : "open-outline"} color={colors.text} size={23} />
            <Text style={styles.communityPrimaryOpenText}>{opened ? "Opened" : "Open app"}</Text>
          </LinearGradient>
        </Pressable>
        <Pressable accessibilityLabel={bookmarked ? "Remove saved app" : "Save app"} accessibilityRole="button" style={styles.communitySmallAction} onPress={onToggleBookmark}>
          <Ionicons name={bookmarked ? "bookmark" : "bookmark-outline"} color={bookmarked ? communityDetailAccent : colors.text} size={21} />
        </Pressable>
        <Pressable accessibilityLabel={liked ? "Unlike app" : "Like app"} accessibilityRole="button" style={styles.communityLikeButton} onPress={onToggleLike}>
          <Ionicons name={liked ? "heart" : "heart-outline"} color={liked ? "#FF6B9A" : colors.text} size={21} />
          <Text style={styles.communityDetailIconText}>{post.likes}</Text>
        </Pressable>
        <Pressable accessibilityLabel="Report app" accessibilityRole="button" style={styles.communitySmallAction} onPress={onReport}>
          <Ionicons name="flag-outline" color={colors.text} size={20} />
        </Pressable>
      </View>

      <View style={styles.communityDetailScreenshots}>
        <Text style={styles.communityDetailPanelTitle}>Preview</Text>
        <ScrollView
          contentContainerStyle={styles.communityScreenshotGrid}
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.communityScreenshotRail}
        >
          {post.screenshots.map((screenshot, index) => (
            <View key={screenshot + "-" + index} style={styles.communityScreenshotPreview}>
              {post.screenshotUrls?.[index]
                ? <Image resizeMode="cover" source={{ uri: post.screenshotUrls[index] }} style={styles.communityScreenshotImage} />
                : <CommunityPreview tone={post.accent} type={post.preview} />}
              <Text numberOfLines={1} style={styles.communityScreenshotLabel}>{screenshot}</Text>
            </View>
          ))}
        </ScrollView>
      </View>

      <View style={styles.communityAboutBlock}>
        <Text style={styles.communityDetailPanelTitle}>About</Text>
        <Text style={styles.communityDetailPanelBody}>{post.about || post.description}</Text>
      </View>

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
          <Pressable disabled={!canPostComment} onPress={onAddComment} style={[styles.communityCommentPostButton, !canPostComment ? styles.communityCommentPostButtonDisabled : null]}>
            {commentPosting ? <ActivityIndicator color={colors.text} size="small" /> : <Ionicons name="send" color={colors.text} size={17} />}
            <Text style={styles.communityCommentPostText}>{commentPosting ? "Posting" : "Post"}</Text>
          </Pressable>
        </View>
        {commentError ? (
          <View style={styles.communityCommentError}>
            <Ionicons name="alert-circle-outline" color="#FFB4C1" size={18} />
            <Text style={styles.communityCommentErrorText}>{commentError}</Text>
          </View>
        ) : null}
        {visibleComments.length ? visibleComments.map((comment) => (
          <View key={comment.id} style={styles.communityCommentRow}>
            <CommunityAuthorAvatar accent={communityDetailAccent} name={comment.name} size={34} />
            <View style={styles.communityCommentCopy}>
              <View style={styles.communityCommentNameRow}>
                <Text style={styles.communityCommentName}>{comment.name}</Text>
                <Text style={styles.communityCommentTime}>{comment.time}</Text>
              </View>
              <Text style={styles.communityCommentText}>{comment.text}</Text>
            </View>
          </View>
        )) : (
          <Text style={styles.communityEmptyText}>No comments yet.</Text>
        )}
      </View>
    </View>
  );
}
