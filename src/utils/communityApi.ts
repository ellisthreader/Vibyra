import { CommunityComment, CommunityPost } from "../screens/workspace/types";
import { appApiRequest, getAppApiUrl } from "./appApi";
import type { HostedDemoPayload } from "./hostedDemo";

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
  deploymentStatus?: string | null;
  hostingMode?: string | null;
  isPublic?: boolean;
  project?: CommunityPost;
  hostedDemoMessage?: string | null;
  hostedDemoStatus?: string | null;
  hostedDemoUrl?: string | null;
  reviewReason?: string | null;
  reviewSummary?: string | null;
  reviewStatus?: string;
  safetyRating?: string;
  safetyScore?: number;
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
  const demoUrl = post.hostedDemoUrl || post.previewUrl || post.publicUrl;
  const appUrl = post.appUrl || demoUrl || "";
  return {
    ...post,
    appUrl: absoluteApiUrl(appUrl),
    accent: post.accent || "#8B35FF",
    hostedDemoStatus: post.hostedDemoStatus ?? post.deploymentStatus,
    hostedDemoMessage: post.hostedDemoMessage,
    hostedDemoUrl: demoUrl ? absoluteApiUrl(demoUrl) : demoUrl,
    previewUrl: post.previewUrl ? absoluteApiUrl(post.previewUrl) : post.previewUrl,
    publicUrl: post.publicUrl ? absoluteApiUrl(post.publicUrl) : post.publicUrl,
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
  hostedDemo?: HostedDemoPayload | null;
  logoImageUrl?: string;
  previewHtml: string;
  projectId: string;
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
    hostedDemoUrl: status.hostedDemoUrl ? absoluteApiUrl(status.hostedDemoUrl) : status.hostedDemoUrl,
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
