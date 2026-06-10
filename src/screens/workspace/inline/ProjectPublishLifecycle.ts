import type { ProjectPublishStatus } from "../../../utils/communityApi";

const ABSENT_LISTING_STATES = new Set(["absent", "deleted", "none", "no_listing", "not_listed"]);
const PENDING_RELEASE_STATES = new Set(["building", "pending", "pending_review", "queued", "starting", "uploading"]);
const FAILED_RELEASE_STATES = new Set(["denied", "failed", "rejected", "stopped"]);

export function hasProjectListing(status?: ProjectPublishStatus | null) {
  if (!status) return false;
  const state = normalized(status.listingState);
  if (state && ABSENT_LISTING_STATES.has(state)) return false;
  return Boolean(
    state || status.id || status.project || status.reviewStatus
    || status.currentReleaseState || status.candidateReleaseState || status.deploymentStatus
  );
}

export function projectListingSlug(status?: ProjectPublishStatus | null) {
  return status?.project?.id || status?.id || "";
}

export function canManageProjectListing(status?: ProjectPublishStatus | null) {
  return allows(status, ["edit_listing", "manage_listing", "update_listing"], hasProjectListing(status));
}

export function canPublishProjectRelease(status?: ProjectPublishStatus | null) {
  return allows(status, ["publish_latest", "publish_latest_version", "publish_release", "republish", "resubmit"], hasProjectListing(status));
}

export function canChangeProjectVisibility(status?: ProjectPublishStatus | null) {
  return allows(status, ["change_visibility", "make_private", "make_public", "update_visibility"], hasProjectListing(status));
}

export function canDeleteProjectListing(status?: ProjectPublishStatus | null) {
  return allows(status, ["delete_listing"], hasProjectListing(status));
}

export function projectPublishMenuLabel(status?: ProjectPublishStatus | null) {
  if (!hasProjectListing(status)) return "Publish to Explore";
  if (hasFailedCandidate(status) && canPublishProjectRelease(status)) return "Fix and resubmit";
  if (hasPendingCandidate(status)) return "View publishing status";
  if (needsPublishingContinuation(status)) return "Continue publishing";
  if (!hasManagementCapability(status)) return "View publishing status";
  return "Manage listing";
}

export function projectPublishStatusLabel(status?: ProjectPublishStatus | null) {
  if (!hasProjectListing(status)) return "";
  const currentLive = isLive(status?.currentReleaseState)
    || (!status?.currentReleaseState && (status?.isOpenable || isLive(status?.deploymentStatus)));
  if (currentLive && hasPendingCandidate(status)) return "Live + Updating";
  if (currentLive && hasFailedCandidate(status)) return "Live + Update failed";
  if (currentLive) return "Live";
  if (hasFailedCandidate(status)) return "Failed";
  if (hasPendingCandidate(status)) return "Publishing";
  if (status?.reviewStatus === "under_review" || status?.reviewStatus === "pending") return "In review";
  if (status?.reviewStatus === "denied") return "Changes needed";
  const listingState = normalized(status?.listingState);
  if (listingState === "pending" || listingState === "pending_review" || listingState === "under_review") return "In review";
  if (listingState === "private" || status?.visibility === "private") return "Private";
  return status?.isDiscoverable ? "Listed" : "Continue";
}

export function hasPendingCandidate(status?: ProjectPublishStatus | null) {
  const state = normalized(status?.candidateReleaseState || status?.deploymentStatus);
  return PENDING_RELEASE_STATES.has(state);
}

export function hasFailedCandidate(status?: ProjectPublishStatus | null) {
  const state = normalized(status?.candidateReleaseState || status?.deploymentStatus);
  return Boolean(status?.candidateError) || FAILED_RELEASE_STATES.has(state);
}

export function shouldShowPublishStatus(status?: ProjectPublishStatus | null) {
  return hasPendingCandidate(status) || (hasProjectListing(status) && !hasManagementCapability(status));
}

export function shouldShowPublishStatusOnly(status?: ProjectPublishStatus | null, error = "") {
  return error.trim() === "" && shouldShowPublishStatus(status);
}

export function publishStatusPollKey(statuses: ProjectPublishStatus[]) {
  return statuses
    .map((status) => [
      status.sourceProjectId,
      status.candidateReleaseState || status.deploymentStatus || "",
      status.deploymentCreatedAt || status.deploymentUpdatedAt || status.updatedAt || "",
      status.listingState || status.reviewStatus || ""
    ].join(":"))
    .sort()
    .join("|");
}

function needsPublishingContinuation(status?: ProjectPublishStatus | null) {
  const state = normalized(status?.listingState);
  return ["draft", "incomplete", "pending", "pending_review", "under_review"].includes(state)
    || (!status?.isOpenable && canPublishProjectRelease(status));
}

function hasManagementCapability(status?: ProjectPublishStatus | null) {
  return canManageProjectListing(status)
    || canPublishProjectRelease(status)
    || canChangeProjectVisibility(status)
    || canDeleteProjectListing(status);
}

function allows(status: ProjectPublishStatus | null | undefined, actions: string[], fallback: boolean) {
  if (!status?.allowedActions) return fallback;
  const allowed = new Set(status.allowedActions.map(normalized));
  return actions.some((action) => allowed.has(action));
}

function normalized(value?: string | null) {
  return (value || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
}

function isLive(value?: string | null) {
  return ["live", "published", "ready", "static_live"].includes(normalized(value));
}
