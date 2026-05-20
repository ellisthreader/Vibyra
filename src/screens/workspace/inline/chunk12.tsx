import React, { useMemo, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { usePreferences, useThemedColor } from "../../../context/PreferencesContext";
import { LoadingScreen } from "../../../components/LoadingScreen";
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
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  const prefs = usePreferences();
  const searchIconColor = useThemedColor("#8E8AA3");
  const filterIconColor = useThemedColor("#B4B1C9");
  const accentIconColor = useThemedColor("#9D80FF");
  const errorIconColor = useThemedColor("#FFB4C1");
  const hasSearchQuery = c.searchQuery.trim().length > 0;
  const canResetResults = hasSearchQuery || c.activeFilter !== "Recent";
  const sortOptions = useMemo<CommunityFilter[]>(() => (
    c.hasFeaturedPosts ? ["Recent", "Popular", "Featured"] : ["Recent", "Popular"]
  ), [c.hasFeaturedPosts]);
  const resetResults = () => {
    c.setSearchQuery("");
    c.setActiveFilter("Recent");
    setSortMenuOpen(false);
  };

  if (selectedPost) {
    const livePost = c.posts.find((post) => post.id === selectedPost.id) ?? selectedPost;
    const added = c.commentsByPostId[livePost.id] ?? [];
    const opened = c.openedPostIds.includes(livePost.id);
    if (openedPostId === livePost.id) return <CommunityOpenedAppPage opened={opened} post={livePost} />;
    return (
      <CommunityPostDetail
        addedComments={added}
        bookmarked={c.bookmarkedPostIds.includes(livePost.id)}
        canComment={Boolean(authToken)}
        commentCount={Math.max(livePost.comments, added.length)}
        commentDraft={c.commentDraftsByPostId[livePost.id] ?? ""}
        commentError={c.commentErrorsByPostId[livePost.id] ?? ""}
        commentPosting={Boolean(c.commentPostingByPostId[livePost.id])}
        liked={c.likedPostIds.includes(livePost.id)}
        opened={opened}
        post={livePost}
        onAddComment={() => c.addComment(livePost.id)}
        onCommentDraftChange={(text) => c.setCommentDraft(livePost.id, text)}
        onOpen={() => c.openApp(livePost.id)}
        onToggleBookmark={() => c.toggleBookmark(livePost.id)}
        onToggleLike={() => c.toggleLike(livePost.id)}
      />
    );
  }

  return (
    <View style={styles.communityScreen}>
      <View style={styles.communitySearchRow}>
        <View style={styles.communitySearchBar}>
          <Ionicons name="search-outline" color={searchIconColor} size={21} />
          <TextInput
            value={c.searchQuery}
            onChangeText={c.setSearchQuery}
            placeholder="Search apps, builders, tags"
            placeholderTextColor={searchIconColor}
            style={styles.communitySearchInput}
          />
          {hasSearchQuery ? (
            <Pressable accessibilityLabel="Clear search" hitSlop={8} onPress={() => c.setSearchQuery("")}>
              <Ionicons name="close-circle" color={searchIconColor} size={18} />
            </Pressable>
          ) : null}
        </View>
        <Pressable
          accessibilityLabel="Sort Explore apps"
          accessibilityRole="button"
          onPress={() => setSortMenuOpen((open) => !open)}
          style={styles.communitySortButton}
        >
          <Ionicons name="funnel-outline" color={filterIconColor} size={18} />
          <Text style={styles.communitySortButtonText}>{c.activeFilter}</Text>
        </Pressable>
      </View>

      {sortMenuOpen ? (
        <View style={styles.communitySortMenu}>
          {sortOptions.map((option) => {
            const active = c.activeFilter === option;
            return (
              <Pressable
                key={option}
                onPress={() => { c.setActiveFilter(option); setSortMenuOpen(false); }}
                style={[styles.communitySortOption, active ? styles.communitySortOptionActive : null]}
              >
                <Text style={[styles.communitySortOptionText, active ? styles.communitySortOptionTextActive : null]}>{option}</Text>
                {active ? <Ionicons name="checkmark" color={filterIconColor} size={16} /> : null}
              </Pressable>
            );
          })}
        </View>
      ) : null}

      <View style={styles.communityFeed}>
        {c.feedLoading ? (
          <LoadingScreen colors={prefs.colors} compact message="Checking for published apps." scheme={prefs.effectiveScheme} style={styles.communityLoadingPage} title="Loading Explore" />
        ) : c.feedError ? (
          <View style={styles.communityEmptyState}>
            <Ionicons name="warning-outline" color={errorIconColor} size={30} />
            <Text style={styles.communityEmptyTitle}>Explore unavailable</Text>
            <Text style={styles.communityEmptyText}>{c.feedError}</Text>
            <Pressable onPress={c.reloadCommunityFeed} style={styles.communityPostOpenButton}>
              <Text style={styles.communityPostOpenText}>Refresh</Text>
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
          />
        )) : (
          <View style={styles.communityEmptyState}>
            <Ionicons name="search-outline" color={accentIconColor} size={30} />
            <Text style={styles.communityEmptyTitle}>{c.posts.length ? "No apps found" : "No apps yet"}</Text>
            <Text style={styles.communityEmptyText}>{c.posts.length ? "Try a different search or sort." : "Published apps will appear here."}</Text>
            {canResetResults ? (
              <Pressable onPress={resetResults} style={styles.communityPostOpenButton}>
                <Text style={styles.communityPostOpenText}>Reset</Text>
              </Pressable>
            ) : null}
          </View>
        )}
      </View>
    </View>
  );
}
