import React from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useThemedColor } from "../../../context/PreferencesContext";
import { useCommunityPage } from "../hooks/useCommunityPage";
import { styles } from "../styles";
import type { CommunityFilter, CommunityPost } from "../types";
import { CommunityPostCard } from "./chunk13";
import { CommunityPostDetail } from "./chunk14";
import { CommunityOpenedAppPage } from "./chunk15";

export function CommunityPage({
  authToken, currentUserName, openedPostId, onLevelActivity, onOpenApp, onSelectPost, selectedPost
}: {
  authToken: string;
  currentUserName: string;
  openedPostId: string | null;
  onOpenApp: (postId: string) => void;
  onLevelActivity?: (action: string, contextId: string, meta?: Record<string, unknown>) => void;
  onSelectPost: (post: CommunityPost | null) => void;
  selectedPost: CommunityPost | null;
}) {
  const c = useCommunityPage(authToken, currentUserName, onOpenApp, onLevelActivity);
  const searchIconColor = useThemedColor("#8E8AA3");
  const filterIconColor = useThemedColor("#B4B1C9");
  const accentIconColor = useThemedColor("#9D80FF");
  const errorIconColor = useThemedColor("#FFB4C1");

  if (selectedPost) {
    const added = c.commentsByPostId[selectedPost.id] ?? [];
    const opened = c.openedPostIds.includes(selectedPost.id);
    if (openedPostId === selectedPost.id) return <CommunityOpenedAppPage opened={opened} post={selectedPost} />;
    return (
      <CommunityPostDetail
        addedComments={added}
        bookmarked={c.bookmarkedPostIds.includes(selectedPost.id)}
        canComment={Boolean(authToken)}
        commentCount={Math.max(selectedPost.comments, added.length)}
        commentDraft={c.commentDraftsByPostId[selectedPost.id] ?? ""}
        commentError={c.commentErrorsByPostId[selectedPost.id] ?? ""}
        commentPosting={Boolean(c.commentPostingByPostId[selectedPost.id])}
        liked={c.likedPostIds.includes(selectedPost.id)}
        opened={opened}
        post={selectedPost}
        onAddComment={() => c.addComment(selectedPost.id)}
        onCommentDraftChange={(text) => c.setCommentDraft(selectedPost.id, text)}
        onOpen={() => c.openApp(selectedPost.id)}
        onToggleBookmark={() => c.toggleBookmark(selectedPost.id)}
        onToggleLike={() => c.toggleLike(selectedPost.id)}
      />
    );
  }

  return (
    <View style={styles.communityScreen}>
      <View style={styles.communityTabs}>
        {(["All", "Recent", "Popular", "Featured"] as CommunityFilter[]).map((filter) => {
          const active = c.activeFilter === filter;
          return (
            <Pressable key={filter} onPress={() => c.setActiveFilter(filter)} style={[styles.communityTab, active ? styles.communityTabActive : null]}>
              <Text style={[styles.communityTabText, active ? styles.communityTabTextActive : null]}>{filter}</Text>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.communitySearchRow}>
        <View style={styles.communitySearchBar}>
          <Ionicons name="search-outline" color={searchIconColor} size={22} />
          <TextInput value={c.searchQuery} onChangeText={c.setSearchQuery} placeholder="Search apps, builders, tags" placeholderTextColor={searchIconColor} style={styles.communitySearchInput} />
        </View>
        <Pressable accessibilityLabel="Cycle community filter" style={styles.communityFilterButton} onPress={c.cycleFilter}>
          <Ionicons name="options-outline" color={filterIconColor} size={22} />
        </Pressable>
      </View>

      <View style={styles.communityFeed}>
        {c.feedLoading ? (
          <View style={styles.communityEmptyState}>
            <Ionicons name="cloud-download-outline" color={accentIconColor} size={30} />
            <Text style={styles.communityEmptyTitle}>Loading Explore</Text>
            <Text style={styles.communityEmptyText}>Checking for published apps...</Text>
          </View>
        ) : c.feedError ? (
          <View style={styles.communityEmptyState}>
            <Ionicons name="warning-outline" color={errorIconColor} size={30} />
            <Text style={styles.communityEmptyTitle}>Explore unavailable</Text>
            <Text style={styles.communityEmptyText}>{c.feedError}</Text>
            <Pressable onPress={c.reloadCommunityFeed} style={styles.communityFilterButton}>
              <Ionicons name="refresh" color={filterIconColor} size={22} />
            </Pressable>
          </View>
        ) : c.filteredPosts.length ? c.filteredPosts.map((post) => (
          <CommunityPostCard
            key={post.id}
            bookmarked={c.bookmarkedPostIds.includes(post.id)}
            liked={c.likedPostIds.includes(post.id)}
            post={post}
            commentCount={Math.max(post.comments, c.commentsByPostId[post.id]?.length ?? 0)}
            onOpen={() => onSelectPost(post)}
            onToggleBookmark={() => c.toggleBookmark(post.id)}
            onToggleLike={() => c.toggleLike(post.id)}
          />
        )) : (
          <View style={styles.communityEmptyState}>
            <Ionicons name="search-outline" color={accentIconColor} size={30} />
            <Text style={styles.communityEmptyTitle}>No apps found</Text>
            <Text style={styles.communityEmptyText}>Try a different search or filter.</Text>
          </View>
        )}
      </View>
    </View>
  );
}
