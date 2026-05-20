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
  publishStatus?: ProjectPublishStatus;
  reviewStatus?: string;
  safetyFindings?: string[];
};

export type PublishProjectVisibility = "public" | "unlisted" | "private";
export type ProjectPublishStatus = {
  isPublic?: boolean;
  project?: CommunityPost;
  reviewReason?: string | null;
  reviewStatus?: string;
  safetyFindings?: unknown[];
  sourceProjectId: string;
  title?: string;
  updatedAt?: string | null;
  visibility?: PublishProjectVisibility;
};
export type PublishProjectOutcome = "published" | "under_review" | "private" | "unlisted";
export type PublishProjectResult = {
  isPublic?: boolean;
  outcome: PublishProjectOutcome;
  project: CommunityPost;
  publishStatus?: ProjectPublishStatus;
  reviewStatus?: string;
  safetyFindings?: string[];
  visibility: PublishProjectVisibility;
};

export type ProjectPublishStatusesResponse = {
  ok: boolean;
  projects: ProjectPublishStatus[];
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

export async function fetchProjectPublishStatuses(authToken: string) {
  const result = await appApiRequest<ProjectPublishStatusesResponse>("/api/projects/publish-status", {}, authToken);
  return (result.projects ?? []).map((status) => normalizePublishStatus(status)).filter(Boolean) as ProjectPublishStatus[];
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
  visibility?: PublishProjectVisibility;
}): Promise<PublishProjectResult> {
  const { authToken, ...body } = payload;
  const result = await appApiRequest<PublishProjectResponse>("/api/projects/publish", {
    method: "POST",
    body: JSON.stringify(body)
  }, authToken);
  const visibility = body.visibility ?? "public";
  return {
    isPublic: result.isPublic,
    outcome: publishOutcome(visibility, result),
    project: normalizeCommunityPost(result.project),
    publishStatus: normalizePublishStatus(result.publishStatus),
    reviewStatus: result.reviewStatus,
    safetyFindings: result.safetyFindings,
    visibility
  };
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

function normalizePublishStatus(status?: ProjectPublishStatus) {
  if (!status) return undefined;
  return {
    ...status,
    project: status.project ? normalizeCommunityPost(status.project) : status.project
  };
}

function absoluteApiUrl(url: string) {
  if (!url || /^https?:\/\//i.test(url)) return url;
  return `${getAppApiUrl()}${url.startsWith("/") ? url : `/${url}`}`;
}

function publishOutcome(visibility: PublishProjectVisibility, result: PublishProjectResponse): PublishProjectOutcome {
  if (result.reviewStatus && result.reviewStatus !== "approved") return "under_review";
  if (visibility === "private") return "private";
  if (visibility === "unlisted") return "unlisted";
  return result.isPublic === false ? "under_review" : "published";
}
