import { CommunityComment, CommunityPost } from "../screens/workspace/types";
import { appApiRequest, getAppApiUrl } from "./appApi";
import type { HostedDemoPayload, HostedRuntimePayload } from "./hostedDemo";
import { sanitizePublicDemoUrl } from "./publicDemoUrls";

export type CommunityProjectsResponse = {
  ok: boolean;
  projects: CommunityPost[];
  comments?: Record<string, CommunityComment[]>;
};

export type PublishProjectResponse = {
  isPublic?: boolean;
  ok: boolean;
  project: CommunityPost;
  hostedDemo?: HostedDemoPayload | null;
  hostedDemoMessage?: string | null;
  hostedDemoStatus?: string | null;
  hostedDemoUrl?: string | null;
  publishStatus?: ProjectPublishStatus;
  reviewSummary?: string | null;
  reviewStatus?: string;
  safetyRating?: string;
  safetyScore?: number;
  safetyFindings?: string[];
};

export type PublishProjectVisibility = "public" | "unlisted" | "private";
export type ProjectPublishStatus = {
  appUrl?: string;
  backendPlatform?: string | null;
  backendStatus?: string | null;
  deploymentStatus?: string | null;
  description?: string;
  frontendStatus?: string | null;
  hostingMode?: string | null;
  id?: string;
  isPublic?: boolean;
  project?: CommunityPost;
  hostedDemoMessage?: string | null;
  hostedDemoStatus?: string | null;
  hostedDemoUrl?: string | null;
  logoImageUrl?: string | null;
  publicUrl?: string | null;
  reviewReason?: string | null;
  reviewSummary?: string | null;
  reviewStatus?: string;
  safetyRating?: string;
  safetyScore?: number;
  safetyFindings?: unknown[];
  screenshotUrls?: string[];
  sourceProjectId: string;
  tags?: string[];
  title?: string;
  updatedAt?: string | null;
  viewerCanManage?: boolean;
  visibility?: PublishProjectVisibility;
};
export type PublishProjectOutcome = "published" | "under_review" | "private" | "unlisted";
export type PublishProjectResult = {
  isPublic?: boolean;
  outcome: PublishProjectOutcome;
  project: CommunityPost;
  hostedDemo?: HostedDemoPayload | null;
  hostedDemoMessage?: string | null;
  hostedDemoStatus?: string | null;
  hostedDemoUrl?: string | null;
  publishStatus?: ProjectPublishStatus;
  reviewSummary?: string | null;
  reviewStatus?: string;
  safetyRating?: string;
  safetyScore?: number;
  safetyFindings?: string[];
  visibility: PublishProjectVisibility;
};

type ProjectPublishStatusesResponse = { ok: boolean; projects: ProjectPublishStatus[]; };

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
  const hostedDemoUrl = sanitizePublicDemoUrl(absoluteApiUrl(post.hostedDemoUrl || ""));
  const previewUrl = sanitizePublicDemoUrl(absoluteApiUrl(post.previewUrl || ""));
  const publicUrl = sanitizePublicDemoUrl(absoluteApiUrl(post.publicUrl || ""));
  const appUrl = sanitizePublicDemoUrl(absoluteApiUrl(post.appUrl || "")) || hostedDemoUrl || previewUrl || publicUrl || "";
  return {
    ...post,
    appUrl,
    accent: post.accent || "#8B35FF",
    hostedDemoStatus: post.hostedDemoStatus ?? post.deploymentStatus,
    hostedDemoMessage: post.hostedDemoMessage,
    hostedDemoUrl,
    previewUrl,
    publicUrl,
    logo: post.logo || "default",
    logoImageUrl: post.logoImageUrl ? absoluteApiUrl(post.logoImageUrl) : post.logoImageUrl,
    preview: post.preview || "analytics",
    screenshots: post.screenshots?.length ? post.screenshots : ["Preview"],
    screenshotUrls: post.screenshotUrls?.map(absoluteApiUrl) ?? [],
    tags: post.tags?.length ? post.tags : ["Vibyra"]
  };
}

export async function fetchCommunityProjects(authToken?: string | null) {
  const result = await appApiRequest<CommunityProjectsResponse>("/api/community/projects", {}, authToken || undefined);
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
  hostedDemo?: HostedDemoPayload | null;
  logoImageUrl?: string;
  previewHtml: string;
  projectId: string;
  runtimeBundle?: HostedRuntimePayload | null;
  screenshotUrls?: string[];
  sourceFiles?: PublishProjectSourceFile[];
  sourceReview?: { totalFiles?: number; truncated?: boolean };
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
  const hostedDemoUrl = result.hostedDemoUrl ?? result.hostedDemo?.url;
  return {
    isPublic: result.isPublic,
    outcome: publishOutcome(visibility, result),
    project: normalizeCommunityPost(result.project),
    hostedDemo: result.hostedDemo,
    hostedDemoMessage: result.hostedDemoMessage ?? result.hostedDemo?.message,
    hostedDemoStatus: result.hostedDemoStatus ?? result.hostedDemo?.status,
    hostedDemoUrl: hostedDemoUrl ? absoluteApiUrl(hostedDemoUrl) : hostedDemoUrl,
    publishStatus: normalizePublishStatus(result.publishStatus),
    reviewSummary: result.reviewSummary,
    reviewStatus: result.reviewStatus,
    safetyRating: result.safetyRating,
    safetyScore: result.safetyScore,
    safetyFindings: result.safetyFindings,
    visibility
  };
}

export async function updatePublishedProjectVisibility(authToken: string, slug: string, visibility: PublishProjectVisibility) {
  const result = await appApiRequest<PublishProjectResponse>(
    `/api/projects/${encodeURIComponent(slug)}/publish`,
    { method: "PATCH", body: JSON.stringify({ visibility }) },
    authToken
  );
  return {
    ...result,
    project: normalizeCommunityPost(result.project),
    publishStatus: normalizePublishStatus(result.publishStatus)
  };
}

export async function deletePublishedProject(authToken: string, slug: string) {
  return appApiRequest<{ ok: boolean; deleted: boolean; slug: string; sourceProjectId?: string }>(
    `/api/projects/${encodeURIComponent(slug)}/publish`,
    { method: "DELETE" },
    authToken
  );
}

export type PublishProjectSourceFile = {
  body: string;
  language?: string;
  path: string;
};

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
    appUrl: sanitizePublicDemoUrl(absoluteApiUrl(status.appUrl || "")),
    hostedDemoUrl: sanitizePublicDemoUrl(absoluteApiUrl(status.hostedDemoUrl || "")),
    logoImageUrl: status.logoImageUrl ? absoluteApiUrl(status.logoImageUrl) : status.logoImageUrl,
    publicUrl: sanitizePublicDemoUrl(absoluteApiUrl(status.publicUrl || "")),
    screenshotUrls: status.screenshotUrls?.map(absoluteApiUrl) ?? [],
    project: status.project ? normalizeCommunityPost(status.project) : status.project
  };
}

function absoluteApiUrl(url: string) {
  if (!url) return url;
  if (/^https?:\/\//i.test(url)) return safePublicUrl(url);
  return safePublicUrl(`${getAppApiUrl()}${url.startsWith("/") ? url : `/${url}`}`);
}

function safePublicUrl(url: string) {
  if (!url || !isPrivateNetworkUrl(url)) return url;
  return isPrivateNetworkUrl(getAppApiUrl()) ? url : "";
}

function isPrivateNetworkUrl(url: string) {
  let host = "";
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return false;
  }
  if (host === "localhost" || host.endsWith(".local")) return true;
  if (/^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host)) return true;
  const match = host.match(/^172\.(\d{1,2})\./);
  return Boolean(match && Number(match[1]) >= 16 && Number(match[1]) <= 31);
}

function publishOutcome(visibility: PublishProjectVisibility, result: PublishProjectResponse): PublishProjectOutcome {
  if (result.reviewStatus && result.reviewStatus !== "approved") return "under_review";
  if (visibility === "private") return "private";
  if (visibility === "unlisted") return "unlisted";
  return result.isPublic === false ? "under_review" : "published";
}
