import React from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useCommunityPage } from "../hooks/useCommunityPage";
import { styles } from "../styles";
import type { CommunityFilter, CommunityPost } from "../types";
import { CommunityOpenedAppPage, CommunityPostCard, CommunityPostDetail } from "./index";

export function CommunityPage({
  authToken, currentUserName, openedPostId, onOpenApp, onSelectPost, selectedPost
}: {
  authToken: string;
  currentUserName: string;
  openedPostId: string | null;
  onOpenApp: (postId: string) => void;
  onSelectPost: (post: CommunityPost | null) => void;
  selectedPost: CommunityPost | null;
}) {
  const c = useCommunityPage(authToken, currentUserName, onOpenApp);

  if (selectedPost) {
    const added = c.commentsByPostId[selectedPost.id] ?? [];
    const opened = c.openedPostIds.includes(selectedPost.id);
    if (openedPostId === selectedPost.id) return <CommunityOpenedAppPage opened={opened} post={selectedPost} />;
    return (
      <CommunityPostDetail
        addedComments={added}
        bookmarked={c.bookmarkedPostIds.includes(selectedPost.id)}
        commentCount={selectedPost.comments + added.length}
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
          <Ionicons name="search-outline" color="#8E8AA3" size={22} />
          <TextInput value={c.searchQuery} onChangeText={c.setSearchQuery} placeholder="Search projects, builders, tags..." placeholderTextColor="#8E8AA3" style={styles.communitySearchInput} />
        </View>
        <Pressable accessibilityLabel="Cycle community filter" style={styles.communityFilterButton} onPress={c.cycleFilter}>
          <Ionicons name="options-outline" color="#B4B1C9" size={22} />
        </Pressable>
      </View>

      <View style={styles.communityFeed}>
        {c.filteredPosts.length ? c.filteredPosts.map((post) => (
          <CommunityPostCard
            key={post.id}
            bookmarked={c.bookmarkedPostIds.includes(post.id)}
            liked={c.likedPostIds.includes(post.id)}
            post={post}
            commentCount={post.comments + (c.commentsByPostId[post.id]?.length ?? 0)}
            onOpen={() => onSelectPost(post)}
            onToggleBookmark={() => c.toggleBookmark(post.id)}
            onToggleLike={() => c.toggleLike(post.id)}
          />
        )) : (
          <View style={styles.communityEmptyState}>
            <Ionicons name="search-outline" color="#9D80FF" size={30} />
            <Text style={styles.communityEmptyTitle}>No apps found</Text>
            <Text style={styles.communityEmptyText}>Try a different search or filter.</Text>
          </View>
        )}
      </View>
    </View>
  );
}
