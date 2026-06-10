import {
  deletePublishedProject, updatePublishedProjectListing, updatePublishedProjectVisibility,
  type ProjectPublishStatus
} from "../../../utils/communityApi";
import type { ProjectListingPayload } from "./ProjectPublishModal.data";
import { projectListingSlug } from "./ProjectPublishLifecycle";
import type { PublishFlowResult } from "./ProjectPublishResult";

export async function saveProjectListing(authToken: string, status: ProjectPublishStatus, payload: ProjectListingPayload) {
  const slug = requiredSlug(status);
  const listing = await updatePublishedProjectListing({
    authToken,
    description: payload.description,
    logoImageUrl: payload.logoImageUrl,
    screenshotUrls: payload.screenshotUrls,
    slug,
    tags: payload.tags,
    title: payload.title
  });
  let publishStatus = listing.publishStatus;
  if (payload.visibilityChanged && payload.visibility !== status.visibility) {
    const visibility = await updatePublishedProjectVisibility(authToken, slug, payload.visibility);
    publishStatus = visibility.publishStatus ?? publishStatus;
  }
  const result: NonNullable<PublishFlowResult> = payload.visibilityChanged
    ? {
      tone: "success",
      title: "Listing details and visibility saved",
      message: payload.visibility === "private" ? "The listing is private and hosting has stopped." : "The listing is public in Explore."
    }
    : { tone: "success", title: "Listing details saved", message: "Your Explore listing metadata is up to date." };
  return { publishStatus, result };
}

export async function removeProjectListing(authToken: string, status: ProjectPublishStatus) {
  await deletePublishedProject(authToken, requiredSlug(status));
  return {
    sourceProjectId: status.sourceProjectId,
    result: {
      tone: "success",
      title: "Listing deleted",
      message: "The Explore listing and its hosted app were removed."
    } satisfies NonNullable<PublishFlowResult>
  };
}

function requiredSlug(status: ProjectPublishStatus) {
  const slug = projectListingSlug(status);
  if (!slug) throw new Error("This listing could not be updated. Refresh Projects and try again.");
  return slug;
}
