import { CommunityComment, CommunityPost } from "../screens/workspace/types";
import { appApiRequest, getAppApiUrl } from "./appApi";

export type CommunityProjectsResponse = {
  ok: boolean;
  projects: CommunityPost[];
  comments?: Record<string, CommunityComment[]>;
};

export type PublishProjectResponse = {
  isPublic?: boolean;
  ok: boolean;
  project: CommunityPost;
  reviewStatus?: string;
  safetyFindings?: string[];
};

export type CommunityCommentResponse = {
  ok: boolean;
  comment: CommunityComment;
};

export type CommunityReactionResponse = {
  ok: boolean;
  liked: boolean;
  duplicate?: boolean;
  likes: number;
};

export type GeneratedPublishAssetResponse = {
  ok: boolean;
  kind: "logo" | "screenshot";
  imageUrl: string;
  provider: string;
  creditCost: number;
  creditsBalance: number;
  user?: import("./appApi").RemoteUser;
};

export function normalizeCommunityPost(post: CommunityPost): CommunityPost {
  return {
    ...post,
    appUrl: absoluteApiUrl(post.appUrl),
    accent: post.accent || "#8B35FF",
    logo: post.logo || "default",
    logoImageUrl: post.logoImageUrl ? absoluteApiUrl(post.logoImageUrl) : post.logoImageUrl,
    preview: post.preview || "analytics",
    screenshots: post.screenshots?.length ? post.screenshots : ["Preview"],
    screenshotUrls: post.screenshotUrls?.map(absoluteApiUrl) ?? [],
    tags: post.tags?.length ? post.tags : ["Vibyra"]
  };
}

export async function fetchCommunityProjects() {
  const result = await appApiRequest<CommunityProjectsResponse>("/api/community/projects");
  return {
    posts: (result.projects ?? []).map(normalizeCommunityPost),
    comments: result.comments ?? {}
  };
}

export async function publishProject(payload: {
  authToken: string;
  description: string;
  logoImageUrl?: string;
  previewHtml: string;
  projectId: string;
  screenshotUrls?: string[];
  stack: string;
  tags: string[];
  title: string;
  visibility?: "public" | "unlisted" | "private";
}) {
  const { authToken, ...body } = payload;
  const result = await appApiRequest<PublishProjectResponse>("/api/projects/publish", {
    method: "POST",
    body: JSON.stringify(body)
  }, authToken);
  return normalizeCommunityPost(result.project);
}

export async function generatePublishAsset(payload: {
  authToken: string;
  description: string;
  kind: "logo" | "screenshot";
  prompt: string;
  title: string;
}) {
  const { authToken, ...body } = payload;
  return appApiRequest<GeneratedPublishAssetResponse>("/api/community/assets/generate", {
    method: "POST",
    body: JSON.stringify(body)
  }, authToken);
}

export async function postCommunityComment(authToken: string, postId: string, text: string) {
  const result = await appApiRequest<CommunityCommentResponse>(
    `/api/community/projects/${encodeURIComponent(postId)}/comments`,
    { method: "POST", body: JSON.stringify({ text }) },
    authToken
  );
  return result.comment;
}

export async function likeCommunityProject(authToken: string, postId: string) {
  return appApiRequest<CommunityReactionResponse>(
    `/api/community/projects/${encodeURIComponent(postId)}/reaction`,
    { method: "POST", body: JSON.stringify({ type: "like" }) },
    authToken
  );
}

export async function unlikeCommunityProject(authToken: string, postId: string) {
  return appApiRequest<CommunityReactionResponse>(
    `/api/community/projects/${encodeURIComponent(postId)}/reaction`,
    { method: "DELETE", body: JSON.stringify({ type: "like" }) },
    authToken
  );
}

function absoluteApiUrl(url: string) {
  if (!url || /^https?:\/\//i.test(url)) return url;
  return `${getAppApiUrl()}${url.startsWith("/") ? url : `/${url}`}`;
}
