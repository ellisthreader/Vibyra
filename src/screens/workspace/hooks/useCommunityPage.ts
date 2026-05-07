import { useCallback, useEffect, useMemo, useState } from "react";
import { appApiRequest } from "../../../utils/appApi";
import { communityPosts } from "../data/community";
import { loadCommunityComments, saveCommunityComments } from "../inline";
import { CommunityComment, CommunityFilter } from "../types";

export function useCommunityPage(authToken: string, currentUserName: string, onOpenAppCb: (id: string) => void) {
  const [activeFilter, setActiveFilter] = useState<CommunityFilter>("All");
  const [bookmarkedPostIds, setBookmarkedPostIds] = useState<string[]>([]);
  const [commentDraftsByPostId, setCommentDraftsByPostId] = useState<Record<string, string>>({});
  const [commentErrorsByPostId, setCommentErrorsByPostId] = useState<Record<string, string>>({});
  const [commentsByPostId, setCommentsByPostId] = useState<Record<string, CommunityComment[]>>(() => loadCommunityComments());
  const [commentPostingByPostId, setCommentPostingByPostId] = useState<Record<string, boolean>>({});
  const [likedPostIds, setLikedPostIds] = useState<string[]>([]);
  const [openedPostIds, setOpenedPostIds] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => { saveCommunityComments(commentsByPostId); }, [commentsByPostId]);

  const filteredPosts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return communityPosts.filter((post) => {
      const matchesFilter = activeFilter === "All" || post.tag === activeFilter;
      const searchable = [post.title, post.description, post.user, ...post.tags].join(" ").toLowerCase();
      return matchesFilter && (!q || searchable.includes(q));
    });
  }, [activeFilter, searchQuery]);

  const toggleBookmark = useCallback((id: string) => {
    setBookmarkedPostIds((c) => c.includes(id) ? c.filter((x) => x !== id) : [...c, id]);
  }, []);
  const toggleLike = useCallback((id: string) => {
    setLikedPostIds((c) => c.includes(id) ? c.filter((x) => x !== id) : [...c, id]);
  }, []);
  const openApp = useCallback((id: string) => {
    setOpenedPostIds((c) => c.includes(id) ? c : [...c, id]);
    onOpenAppCb(id);
  }, [onOpenAppCb]);

  const addComment = useCallback(async (postId: string) => {
    const text = (commentDraftsByPostId[postId] ?? "").trim();
    if (!text) return;
    setCommentErrorsByPostId((c) => ({ ...c, [postId]: "" }));
    setCommentPostingByPostId((c) => ({ ...c, [postId]: true }));
    try {
      if (!authToken) throw new Error("Log in to post a comment.");
      await appApiRequest("/api/moderation", { method: "POST", body: JSON.stringify({ surface: "community.comment", text }) }, authToken);
    } catch (err) {
      setCommentErrorsByPostId((c) => ({ ...c, [postId]: err instanceof Error ? err.message : "That comment could not be posted." }));
      setCommentPostingByPostId((c) => ({ ...c, [postId]: false }));
      return;
    }
    const displayName = currentUserName.trim() || "You";
    setCommentsByPostId((c) => ({
      ...c,
      [postId]: [...(c[postId] ?? []), { id: `community-comment-${Date.now()}`, name: displayName, text, time: "Just now" }]
    }));
    setCommentDraftsByPostId((c) => ({ ...c, [postId]: "" }));
    setCommentPostingByPostId((c) => ({ ...c, [postId]: false }));
  }, [authToken, commentDraftsByPostId, currentUserName]);

  const cycleFilter = useCallback(() => {
    const filters: CommunityFilter[] = ["All", "Recent", "Popular", "Featured"];
    const next = (filters.indexOf(activeFilter) + 1) % filters.length;
    setActiveFilter(filters[next]);
  }, [activeFilter]);

  const setCommentDraft = useCallback((postId: string, text: string) => {
    setCommentDraftsByPostId((c) => ({ ...c, [postId]: text }));
  }, []);

  return {
    activeFilter, setActiveFilter,
    bookmarkedPostIds, likedPostIds, openedPostIds,
    commentDraftsByPostId, commentErrorsByPostId, commentsByPostId, commentPostingByPostId,
    searchQuery, setSearchQuery,
    filteredPosts, toggleBookmark, toggleLike, openApp, addComment, cycleFilter, setCommentDraft
  };
}
