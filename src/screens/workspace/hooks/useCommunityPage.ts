import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchCommunityProjects, likeCommunityProject, postCommunityComment, unlikeCommunityProject } from "../../../utils/communityApi";
import { communityPosts } from "../data/community";
import { loadCommunityComments, loadCommunityCommentsAsync, saveCommunityComments } from "../inline";
import { CommunityComment, CommunityFilter, CommunityPost } from "../types";

export function useCommunityPage(
  authToken: string,
  currentUserName: string,
  onOpenAppCb: (id: string) => void,
  onLevelActivity?: (action: string, contextId: string, meta?: Record<string, unknown>) => void
) {
  const [activeFilter, setActiveFilter] = useState<CommunityFilter>("All");
  const [bookmarkedPostIds, setBookmarkedPostIds] = useState<string[]>([]);
  const [commentDraftsByPostId, setCommentDraftsByPostId] = useState<Record<string, string>>({});
  const [commentErrorsByPostId, setCommentErrorsByPostId] = useState<Record<string, string>>({});
  const [commentsReady, setCommentsReady] = useState(false);
  const [commentsByPostId, setCommentsByPostId] = useState<Record<string, CommunityComment[]>>(() => loadCommunityComments());
  const [commentPostingByPostId, setCommentPostingByPostId] = useState<Record<string, boolean>>({});
  const [feedError, setFeedError] = useState("");
  const [feedLoading, setFeedLoading] = useState(true);
  const [likedPostIds, setLikedPostIds] = useState<string[]>([]);
  const [openedPostIds, setOpenedPostIds] = useState<string[]>([]);
  const [posts, setPosts] = useState<CommunityPost[]>(communityPosts);
  const postsRef = useRef(posts);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    postsRef.current = posts;
  }, [posts]);

  useEffect(() => {
    let cancelled = false;
    loadCommunityCommentsAsync()
      .then((comments) => { if (!cancelled) setCommentsByPostId(comments); })
      .finally(() => { if (!cancelled) setCommentsReady(true); });
    return () => { cancelled = true; };
  }, []);
  useEffect(() => {
    if (commentsReady) void saveCommunityComments(commentsByPostId);
  }, [commentsByPostId, commentsReady]);
  const loadCommunityFeed = useCallback(() => {
    let cancelled = false;
    setFeedLoading(true);
    setFeedError("");
    fetchCommunityProjects()
      .then(({ comments, posts }) => {
        if (cancelled) return;
        setPosts(posts);
        if (Object.keys(comments).length > 0) setCommentsByPostId((current) => ({ ...current, ...comments }));
      })
      .catch((error) => {
        if (!cancelled) {
          const fallbackPosts = postsRef.current.length > 0 ? postsRef.current : communityPosts;
          setPosts(fallbackPosts);
          setFeedError(fallbackPosts.length > 0 ? "" : communityFeedError(error));
        }
      })
      .finally(() => { if (!cancelled) setFeedLoading(false); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => loadCommunityFeed(), [loadCommunityFeed]);

  const filteredPosts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return posts.filter((post) => {
      const matchesFilter = activeFilter === "All" || post.tag === activeFilter;
      const searchable = [post.title, post.description, post.user, ...post.tags].join(" ").toLowerCase();
      return matchesFilter && (!q || searchable.includes(q));
    });
  }, [activeFilter, posts, searchQuery]);

  const toggleBookmark = useCallback((id: string) => {
    setBookmarkedPostIds((c) => c.includes(id) ? c.filter((x) => x !== id) : [...c, id]);
  }, []);
  const toggleLike = useCallback((id: string) => {
    if (!authToken) return;
    setLikedPostIds((c) => {
      const liked = c.includes(id);
      setPosts((items) => items.map((post) => (
        post.id === id ? { ...post, likes: Math.max(0, post.likes + (liked ? -1 : 1)) } : post
      )));
      void (liked ? unlikeCommunityProject(authToken, id) : likeCommunityProject(authToken, id))
        .then((result) => {
          setPosts((items) => items.map((post) => (
            post.id === id ? { ...post, likes: result.likes } : post
          )));
          if (!liked) onLevelActivity?.("community_like", `community-like:${id}`, { postId: id });
        })
        .catch(() => {
          setLikedPostIds((current) => liked ? [...current, id] : current.filter((x) => x !== id));
          setPosts((items) => items.map((post) => (
            post.id === id ? { ...post, likes: Math.max(0, post.likes + (liked ? 1 : -1)) } : post
          )));
        });
      if (liked) return c.filter((x) => x !== id);
      return [...c, id];
    });
  }, [authToken, onLevelActivity]);
  const openApp = useCallback((id: string) => {
    setOpenedPostIds((c) => {
      if (c.includes(id)) return c;
      onLevelActivity?.("community_open_app", `community-open-app:${id}`, { postId: id });
      return [...c, id];
    });
    onOpenAppCb(id);
  }, [onLevelActivity, onOpenAppCb]);

  const addComment = useCallback(async (postId: string) => {
    const text = (commentDraftsByPostId[postId] ?? "").trim();
    if (!text) return;
    setCommentErrorsByPostId((c) => ({ ...c, [postId]: "" }));
    setCommentPostingByPostId((c) => ({ ...c, [postId]: true }));
    let posted: CommunityComment | null = null;
    try {
      if (!authToken) throw new Error("Log in to post a comment.");
      posted = await postCommunityComment(authToken, postId, text);
    } catch (err) {
      setCommentErrorsByPostId((c) => ({ ...c, [postId]: err instanceof Error ? err.message : "That comment could not be posted." }));
      setCommentPostingByPostId((c) => ({ ...c, [postId]: false }));
      return;
    }
    const displayName = currentUserName.trim() || "You";
    setCommentsByPostId((c) => ({
      ...c,
      [postId]: [...(c[postId] ?? []), posted ?? { id: `community-comment-${Date.now()}`, name: displayName, text, time: "Just now" }]
    }));
    onLevelActivity?.("community_comment", `community-comment:${postId}:${Date.now()}`, { postId });
    setCommentDraftsByPostId((c) => ({ ...c, [postId]: "" }));
    setCommentPostingByPostId((c) => ({ ...c, [postId]: false }));
  }, [authToken, commentDraftsByPostId, currentUserName, onLevelActivity]);

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
    feedError, feedLoading, reloadCommunityFeed: loadCommunityFeed,
    searchQuery, setSearchQuery,
    filteredPosts, toggleBookmark, toggleLike, openApp, addComment, cycleFilter, setCommentDraft
  };
}

function communityFeedError(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (message.toLowerCase().includes("could not reach vibyra")) {
    return "Community is waiting for the Vibyra backend. Start the backend, then refresh.";
  }
  return message || "Community could not be loaded.";
}
