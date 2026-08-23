import { appApiRequest } from "./appApi";
import {
  absoluteApiUrl,
  normalizeCommunityPost,
  normalizePublishStatus,
  publishOutcome,
} from "./communityApiNormalization";
import type {
  ProjectPublishStatus,
  PublishProjectInput,
  PublishProjectResponse,
  PublishProjectResult,
  PublishProjectVisibility,
} from "./communityApiTypes";

type ProjectPublishStatusesResponse = { ok: boolean; projects: ProjectPublishStatus[] };
type UpdateProjectListingResponse = {
  action: "listing_updated";
  ok?: boolean;
  project: PublishProjectResponse["project"];
  publishStatus: ProjectPublishStatus;
};

export async function fetchProjectPublishStatuses(authToken: string) {
  const result = await appApiRequest<ProjectPublishStatusesResponse>(
    "/api/projects/publish-status", {}, authToken,
  );
  return (result.projects ?? [])
    .map((status) => normalizePublishStatus(status))
    .filter(Boolean) as ProjectPublishStatus[];
}

export async function publishProject(
  payload: PublishProjectInput,
): Promise<PublishProjectResult> {
  const { authToken, ...body } = payload;
  const result = await appApiRequest<PublishProjectResponse>("/api/projects/publish", {
    method: "POST",
    body: JSON.stringify(body),
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
    visibility,
  };
}

export async function updatePublishedProjectVisibility(
  authToken: string,
  slug: string,
  visibility: PublishProjectVisibility,
) {
  const result = await appApiRequest<PublishProjectResponse>(
    `/api/projects/${encodeURIComponent(slug)}/publish`,
    { method: "PATCH", body: JSON.stringify({ visibility }) },
    authToken,
  );
  return {
    ...result,
    project: normalizeCommunityPost(result.project),
    publishStatus: normalizePublishStatus(result.publishStatus),
  };
}

export async function updatePublishedProjectListing(payload: {
  authToken: string;
  description: string;
  logoImageUrl?: string;
  screenshotUrls?: string[];
  slug: string;
  tags: string[];
  title: string;
}) {
  const { authToken, slug, ...body } = payload;
  const result = await appApiRequest<UpdateProjectListingResponse>(
    `/api/projects/${encodeURIComponent(slug)}/listing`,
    { method: "PATCH", body: JSON.stringify(body) },
    authToken,
  );
  return {
    action: result.action,
    project: normalizeCommunityPost(result.project),
    publishStatus: normalizePublishStatus(result.publishStatus),
  };
}

export async function deletePublishedProject(authToken: string, slug: string) {
  return appApiRequest<{ ok: boolean; deleted: boolean; slug: string; sourceProjectId?: string }>(
    `/api/projects/${encodeURIComponent(slug)}/publish`,
    { method: "DELETE" },
    authToken,
  );
}
