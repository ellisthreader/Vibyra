import React from "react";
import { Image, Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { styles } from "../styles";
import type { CommunityPost } from "../types";
import { CommunityAppLogo } from "./chunk16";

export function CommunityPostCard({ bookmarked, commentCount, liked, onOpen, onReport, post }: {
  bookmarked: boolean;
  commentCount: number;
  liked: boolean;
  onOpen: () => void;
  onReport: () => void;
  post: CommunityPost;
}) {
  const screenshot = post.screenshotUrls?.[0];
  return (
    <Pressable accessibilityRole="button" style={({ pressed }) => [styles.communityPostCard, pressed ? styles.communityPostCardPressed : null]} onPress={onOpen}>
      <View style={styles.communityPostMedia}>
        {screenshot ? (
          <Image source={{ uri: screenshot }} style={styles.communityPostImage} />
        ) : (
          <View style={styles.communityPostLogoFallback}>
            <CommunityAppLogo post={post} size={54} />
          </View>
        )}
      </View>
      <View style={styles.communityPostBodyCopy}>
        <View style={styles.communityPostTitleRow}>
          <Text numberOfLines={1} style={styles.communityPostTitle}>{post.title}</Text>
          {bookmarked ? <Ionicons name="bookmark" color={post.accent} size={15} /> : null}
        </View>
        <Text numberOfLines={2} style={styles.communityPostDescription}>{post.description}</Text>
        <View style={styles.communityPostMetaRow}>
          <Text numberOfLines={1} style={styles.communityMakerMiniName}>{post.user}</Text>
          <Text style={styles.communityMakerMiniDot}>-</Text>
          <Text numberOfLines={1} style={styles.communityMakerMiniTime}>{post.time}</Text>
        </View>
        <View style={styles.communityPostMetaStats}>
          <View style={styles.communityPostStat}>
            <Ionicons name={liked ? "heart" : "heart-outline"} color={liked ? "#FF6B9A" : "#9F9AAD"} size={15} />
            <Text style={[styles.communityPostStatText, liked ? styles.communityPostStatLiked : null]}>{post.likes}</Text>
          </View>
          <View style={styles.communityPostStat}>
            <Ionicons name="chatbubble-outline" color="#9F9AAD" size={15} />
            <Text style={styles.communityPostStatText}>{commentCount}</Text>
          </View>
          <Pressable accessibilityLabel="Report app" hitSlop={8} onPress={(event) => { event.stopPropagation(); onReport(); }} style={styles.communityPostReportButton}>
            <Ionicons name="flag-outline" color="#9F9AAD" size={15} />
          </Pressable>
          <Ionicons name="chevron-forward" color="#8E899A" size={17} style={styles.communityPostChevron} />
        </View>
      </View>
    </Pressable>
  );
}
