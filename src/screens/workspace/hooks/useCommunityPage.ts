import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchCommunityProjects, likeCommunityProject, postCommunityComment, unlikeCommunityProject } from "../../../utils/communityApi";
import { communityPosts, isSampleCommunityPostId } from "../data/community";
import { loadCommunityComments, loadCommunityCommentsAsync, saveCommunityComments } from "../inline";
import { CommunityComment, CommunityFilter, CommunityPost } from "../types";
import { communityFeedError, createModeratedSampleComment, mergeCommunityComments, mergeIdLists } from "./communityPageHelpers";
import { loadCommunityReactions, loadCommunityReactionsAsync, saveCommunityReactions } from "./communityReactionStorage";

export function useCommunityPage(
  authToken: string,
  currentUserName: string,
  onOpenAppCb: (id: string) => void,
  onLevelActivity?: (action: string, contextId: string, meta?: Record<string, unknown>) => void
) {
  const [activeFilter, setActiveFilter] = useState<CommunityFilter>("Recent");
  const savedReactions = useMemo(() => loadCommunityReactions(), []);
  const [bookmarkedPostIds, setBookmarkedPostIds] = useState<string[]>(savedReactions.bookmarkedPostIds);
  const [commentDraftsByPostId, setCommentDraftsByPostId] = useState<Record<string, string>>({});
  const [commentErrorsByPostId, setCommentErrorsByPostId] = useState<Record<string, string>>({});
  const [commentsReady, setCommentsReady] = useState(false);
  const [commentsByPostId, setCommentsByPostId] = useState<Record<string, CommunityComment[]>>(() => loadCommunityComments());
  const [commentPostingByPostId, setCommentPostingByPostId] = useState<Record<string, boolean>>({});
  const [feedError, setFeedError] = useState("");
  const [feedLoading, setFeedLoading] = useState(false);
  const [likedPostIds, setLikedPostIds] = useState<string[]>(savedReactions.likedPostIds);
  const [reactionsReady, setReactionsReady] = useState(false);
  const [openedPostIds, setOpenedPostIds] = useState<string[]>([]);
  const [posts, setPosts] = useState<CommunityPost[]>(communityPosts);
  const postsRef = useRef(posts);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    postsRef.current = posts;
  }, [posts]);

  useEffect(() => {
    let cancelled = false;
    loadCommunityReactionsAsync()
      .then((state) => {
        if (cancelled) return;
        setBookmarkedPostIds((current) => mergeIdLists(current, state.bookmarkedPostIds));
        setLikedPostIds((current) => mergeIdLists(current, state.likedPostIds));
      })
      .finally(() => { if (!cancelled) setReactionsReady(true); });
    return () => { cancelled = true; };
  }, []);
  useEffect(() => {
    if (reactionsReady) void saveCommunityReactions({ bookmarkedPostIds, likedPostIds });
  }, [bookmarkedPostIds, likedPostIds, reactionsReady]);

  useEffect(() => {
    let cancelled = false;
    loadCommunityCommentsAsync()
      .then((comments) => {
        if (!cancelled) setCommentsByPostId((current) => mergeCommunityComments(current, comments));
      })
      .finally(() => { if (!cancelled) setCommentsReady(true); });
    return () => { cancelled = true; };
  }, []);
  useEffect(() => {
    if (commentsReady) void saveCommunityComments(commentsByPostId);
  }, [commentsByPostId, commentsReady]);
  const loadCommunityFeed = useCallback((showLoading = true) => {
    let cancelled = false;
    if (showLoading) setFeedLoading(true);
    setFeedError("");
    fetchCommunityProjects()
      .then(({ comments, posts }) => {
        if (cancelled) return;
        setPosts(posts.length > 0 ? posts : communityPosts);
        if (Object.keys(comments).length > 0) setCommentsByPostId((current) => mergeCommunityComments(current, comments));
      })
      .catch((error) => {
        if (!cancelled) {
          const fallbackPosts = postsRef.current.length > 0 ? postsRef.current : communityPosts;
          setPosts(fallbackPosts);
          setFeedError(fallbackPosts.length > 0 ? "" : communityFeedError(error));
        }
      })
      .finally(() => { if (!cancelled && showLoading) setFeedLoading(false); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => loadCommunityFeed(false), [loadCommunityFeed]);

  const filteredPosts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const matchesSearch = posts.filter((post) => {
      const searchable = [post.title, post.description, post.user, ...post.tags].join(" ").toLowerCase();
      return !q || searchable.includes(q);
    });
    if (activeFilter === "Popular") {
      return [...matchesSearch].sort((a, b) => (b.likes + b.comments) - (a.likes + a.comments));
    }
    if (activeFilter === "Featured") {
      const featured = matchesSearch.filter((post) => post.tag === "Featured" || post.tags.includes("Featured"));
      return featured.length > 0 ? featured : matchesSearch;
    }
    return matchesSearch;
  }, [activeFilter, posts, searchQuery]);

  const hasFeaturedPosts = useMemo(
    () => posts.some((post) => post.tag === "Featured" || post.tags.includes("Featured")),
    [posts]
  );

  const toggleBookmark = useCallback((id: string) => {
    setBookmarkedPostIds((c) => c.includes(id) ? c.filter((x) => x !== id) : [...c, id]);
  }, []);
  const toggleLike = useCallback((id: string) => {
    if (!authToken && !isSampleCommunityPostId(id)) return;
    setLikedPostIds((c) => {
      const liked = c.includes(id);
      setPosts((items) => items.map((post) => (
        post.id === id ? { ...post, likes: Math.max(0, post.likes + (liked ? -1 : 1)) } : post
      )));
      if (isSampleCommunityPostId(id)) {
        if (!liked) onLevelActivity?.("community_like", `community-like:${id}`, { postId: id });
        return liked ? c.filter((x) => x !== id) : [...c, id];
      }
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
    let posted: CommunityComment;
    try {
      if (!authToken) throw new Error("Log in to post a comment.");
      posted = isSampleCommunityPostId(postId)
        ? await createModeratedSampleComment(authToken, currentUserName, text)
        : await postCommunityComment(authToken, postId, text);
    } catch (err) {
      setCommentErrorsByPostId((c) => ({ ...c, [postId]: err instanceof Error ? err.message : "That comment could not be posted." }));
      setCommentPostingByPostId((c) => ({ ...c, [postId]: false }));
      return;
    }
    setCommentsByPostId((c) => ({
      ...c,
      [postId]: [...(c[postId] ?? []), posted]
    }));
    setPosts((items) => items.map((post) => (
      post.id === postId ? { ...post, comments: post.comments + 1 } : post
    )));
    onLevelActivity?.("community_comment", `community-comment:${postId}:${Date.now()}`, { postId });
    setCommentDraftsByPostId((c) => ({ ...c, [postId]: "" }));
    setCommentPostingByPostId((c) => ({ ...c, [postId]: false }));
  }, [authToken, commentDraftsByPostId, currentUserName, onLevelActivity]);

  const setCommentDraft = useCallback((postId: string, text: string) => {
    setCommentDraftsByPostId((c) => ({ ...c, [postId]: text }));
  }, []);

  return {
    activeFilter, setActiveFilter, hasFeaturedPosts, posts,
    bookmarkedPostIds, likedPostIds, openedPostIds,
    commentDraftsByPostId, commentErrorsByPostId, commentsByPostId, commentPostingByPostId,
    feedError, feedLoading, reloadCommunityFeed: () => loadCommunityFeed(true),
    searchQuery, setSearchQuery,
    filteredPosts, toggleBookmark, toggleLike, openApp, addComment, setCommentDraft
  };
}
