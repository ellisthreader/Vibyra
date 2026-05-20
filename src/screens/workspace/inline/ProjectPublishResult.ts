import type { ProjectPublishStatus, PublishProjectOutcome } from "../../../utils/communityApi";

export type PublishFlowResult = { tone: "success" | "info" | "danger"; title: string; message: string } | null;
type PublishOutcomeResult = { tone: "success" | "info"; title: string; message: string } | null;

export function publishResultFromOutcome(outcome: PublishProjectOutcome): PublishOutcomeResult {
  if (outcome === "published") return { tone: "success", title: "Published to Explore", message: "Your project is live and discoverable in Explore." };
  if (outcome === "under_review") return { tone: "info", title: "Project under review", message: "It is currently under review and will appear in Explore after approval." };
  if (outcome === "private") return { tone: "info", title: "Saved privately", message: "Only you can view this published project." };
  return { tone: "info", title: "Saved as unlisted", message: "Anyone with the link can view it, but it will not appear in Explore." };
}

export function publishResultFromStatus(status?: ProjectPublishStatus | null): PublishFlowResult {
  const reviewStatus = status?.reviewStatus;
  if (!reviewStatus) return null;
  if (reviewStatus === "denied") return { tone: "danger", title: "Review denied", message: status?.reviewReason || "This project needs changes before it can appear in Explore." };
  if (reviewStatus === "under_review" || reviewStatus === "pending") return { tone: "info", title: "Project under review", message: "It is currently under review and will appear in Explore after approval." };
  if (status?.visibility === "private") return { tone: "info", title: "Saved privately", message: "Only you can view this published project." };
  if (status?.visibility === "unlisted") return { tone: "info", title: "Saved as unlisted", message: "Anyone with the link can view it, but it will not appear in Explore." };
  if (reviewStatus === "approved") return { tone: "success", title: "Project approved", message: "Your project is approved and visible in Explore." };
  return null;
}

export function publishStatusLabel(status?: ProjectPublishStatus | null) {
  if (!status?.reviewStatus) return "";
  if (status.reviewStatus === "denied") return "Denied";
  if (status.reviewStatus === "under_review" || status.reviewStatus === "pending") return "Under review";
  if (status.visibility === "private") return "Private";
  if (status.visibility === "unlisted") return "Unlisted";
  if (status.reviewStatus === "approved") return "Approved";
  return "Review";
}

export function isPublishReviewLocked(status?: ProjectPublishStatus | null) {
  return status?.reviewStatus === "under_review" || status?.reviewStatus === "pending";
}
