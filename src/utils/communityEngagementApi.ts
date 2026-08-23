import { appApiRequest } from "./appApi";
import { normalizeCommunityPost } from "./communityApiNormalization";
import type {
  CommunityCommentResponse,
  CommunityProjectsResponse,
  CommunityReactionResponse,
  CommunityReportInput,
  CommunityReportResponse,
  GeneratedPublishAssetResponse,
} from "./communityApiTypes";

export async function fetchCommunityProjects(authToken?: string | null) {
  const result = await appApiRequest<CommunityProjectsResponse>(
    "/api/community/projects", {}, authToken || undefined,
  );
  return {
    posts: (result.projects ?? []).map(normalizeCommunityPost),
    comments: result.comments ?? {},
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
    body: JSON.stringify(body),
  }, authToken);
}

export async function postCommunityComment(authToken: string, postId: string, text: string) {
  const result = await appApiRequest<CommunityCommentResponse>(
    `/api/community/projects/${encodeURIComponent(postId)}/comments`,
    { method: "POST", body: JSON.stringify({ text }) },
    authToken,
  );
  return result.comment;
}

export function reportCommunityProject(authToken: string, postId: string, report: CommunityReportInput) {
  return appApiRequest<CommunityReportResponse>(
    `/api/community/projects/${encodeURIComponent(postId)}/reports`,
    { method: "POST", body: JSON.stringify(report) },
    authToken,
  );
}

export async function likeCommunityProject(authToken: string, postId: string) {
  return reaction(authToken, postId, "POST");
}

export async function unlikeCommunityProject(authToken: string, postId: string) {
  return reaction(authToken, postId, "DELETE");
}

function reaction(authToken: string, postId: string, method: "POST" | "DELETE") {
  return appApiRequest<CommunityReactionResponse>(
    `/api/community/projects/${encodeURIComponent(postId)}/reaction`,
    { method, body: JSON.stringify({ type: "like" }) },
    authToken,
  );
}
