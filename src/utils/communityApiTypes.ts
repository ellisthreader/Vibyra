import type { CommunityComment, CommunityPost } from "../screens/workspace/types";
import type { HostedDemoPayload, HostedRuntimePayload } from "./hostedDemo";

export type CommunityProjectsResponse = {
  ok: boolean;
  projects: CommunityPost[];
  comments?: Record<string, CommunityComment[]>;
};

export type PublishProjectVisibility = "public" | "unlisted" | "private";
export type ProjectPublishStatus = {
  allowedActions?: string[];
  appUrl?: string;
  backendPlatform?: string | null;
  backendStatus?: string | null;
  candidateError?: string | null;
  candidateReleaseState?: string | null;
  currentPublicUrl?: string | null;
  currentReleaseState?: string | null;
  deploymentCreatedAt?: string | null;
  deploymentStatus?: string | null;
  deploymentUpdatedAt?: string | null;
  description?: string;
  frontendStatus?: string | null;
  hostingMode?: string | null;
  id?: string;
  isDiscoverable?: boolean;
  isOpenable?: boolean;
  isPublic?: boolean;
  listingState?: string | null;
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

export type PublishProjectSourceFile = {
  body: string;
  language?: string;
  path: string;
};

export type PublishProjectInput = {
  authToken: string;
  capabilities?: { backend: boolean; frontend: boolean };
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
};

export type CommunityCommentResponse = { ok: boolean; comment: CommunityComment };
export type CommunityReactionResponse = {
  ok: boolean;
  liked: boolean;
  duplicate?: boolean;
  likes: number;
};
export type CommunityReportReason = "broken_app" | "unsafe_content" | "spam_or_scam" | "other";
export type CommunityReportInput = {
  details?: string;
  reason: CommunityReportReason;
  screenshot?: string | null;
};
export type CommunityReportResponse = {
  ok: boolean;
  report: { createdAt: string | null; id: number; status: "pending" };
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
