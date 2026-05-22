import { moderateCommunityComment } from "../../../utils/communityModerationApi";
import { CommunityComment } from "../types";

export function mergeCommunityComments(
  current: Record<string, CommunityComment[]>,
  incoming: Record<string, CommunityComment[]>
) {
  const next = { ...current };
  Object.entries(incoming).forEach(([postId, comments]) => {
    const existing = next[postId] ?? [];
    const seen = new Set(existing.map((comment) => comment.id));
    next[postId] = [...existing, ...comments.filter((comment) => !seen.has(comment.id))];
  });
  return next;
}

export function mergeIdLists(current: string[], incoming: string[]) {
  return Array.from(new Set([...current, ...incoming]));
}

export function communityFeedError(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (message.toLowerCase().includes("could not reach vibyra")) {
    return "Community is waiting for the Vibyra backend. Start the backend, then refresh.";
  }
  return message || "Community could not be loaded.";
}

export async function createModeratedSampleComment(
  authToken: string,
  currentUserName: string,
  text: string
): Promise<CommunityComment> {
  await moderateCommunityComment(authToken, text);
  return {
    id: `sample-comment-${Date.now()}`,
    name: currentUserName.trim() || "You",
    text,
    time: "Just now"
  };
}
