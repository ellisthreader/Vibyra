import type { CommunityPost } from "../screens/workspace/types";
import { getAppApiUrl } from "./appApi";
import { sanitizePublicDemoUrl } from "./publicDemoUrls";
import type {
  ProjectPublishStatus,
  PublishProjectOutcome,
  PublishProjectResponse,
  PublishProjectVisibility,
} from "./communityApiTypes";

export function normalizeCommunityPost(post: CommunityPost): CommunityPost {
  const hostedDemoUrl = sanitizePublicDemoUrl(absoluteApiUrl(post.hostedDemoUrl || ""));
  const previewUrl = sanitizePublicDemoUrl(absoluteApiUrl(post.previewUrl || ""));
  const publicUrl = sanitizePublicDemoUrl(absoluteApiUrl(post.publicUrl || ""));
  const appUrl = sanitizePublicDemoUrl(absoluteApiUrl(post.appUrl || ""))
    || hostedDemoUrl || previewUrl || publicUrl || "";
  return {
    ...post,
    appUrl,
    accent: post.accent || "#5B7CFA",
    hostedDemoStatus: post.hostedDemoStatus ?? post.deploymentStatus,
    hostedDemoMessage: post.hostedDemoMessage,
    hostedDemoUrl,
    previewUrl,
    publicUrl,
    logo: post.logo || "default",
    logoImageUrl: post.logoImageUrl ? absoluteApiUrl(post.logoImageUrl) : post.logoImageUrl,
    preview: post.preview || "analytics",
    screenshots: post.screenshots ?? [],
    screenshotUrls: post.screenshotUrls?.map((url) => url?.trim() ? absoluteApiUrl(url) : "") ?? [],
    tags: post.tags?.length ? post.tags : ["Vibyra"],
  };
}

export function normalizePublishStatus(status?: ProjectPublishStatus) {
  if (!status) return undefined;
  return {
    ...status,
    appUrl: sanitizePublicDemoUrl(absoluteApiUrl(status.appUrl || "")),
    hostedDemoUrl: sanitizePublicDemoUrl(absoluteApiUrl(status.hostedDemoUrl || "")),
    logoImageUrl: status.logoImageUrl ? absoluteApiUrl(status.logoImageUrl) : status.logoImageUrl,
    publicUrl: sanitizePublicDemoUrl(absoluteApiUrl(status.publicUrl || "")),
    currentPublicUrl: sanitizePublicDemoUrl(absoluteApiUrl(status.currentPublicUrl || "")),
    screenshotUrls: status.screenshotUrls?.map(absoluteApiUrl) ?? [],
    project: status.project ? normalizeCommunityPost(status.project) : status.project,
  };
}

export function absoluteApiUrl(url: string) {
  if (!url) return url;
  if (/^https?:\/\//i.test(url)) return safePublicUrl(url);
  return safePublicUrl(`${getAppApiUrl()}${url.startsWith("/") ? url : `/${url}`}`);
}

export function publishOutcome(
  visibility: PublishProjectVisibility,
  result: PublishProjectResponse,
): PublishProjectOutcome {
  if (result.reviewStatus && result.reviewStatus !== "approved") return "under_review";
  if (visibility === "private") return "private";
  if (visibility === "unlisted") return "unlisted";
  return result.isPublic === false ? "under_review" : "published";
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
