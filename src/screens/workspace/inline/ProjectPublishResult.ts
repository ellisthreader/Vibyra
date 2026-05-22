import type { ProjectPublishStatus, PublishProjectOutcome } from "../../../utils/communityApi";

export type PublishFlowResult = { tone: "success" | "info" | "danger"; title: string; message: string } | null;
type PublishOutcomeResult = { tone: "success" | "info"; title: string; message: string } | null;
type SafetyResultInfo = { hostedDemoStatus?: string | null; reviewSummary?: string | null; safetyRating?: string; safetyScore?: number };

export function publishResultFromOutcome(outcome: PublishProjectOutcome, result?: SafetyResultInfo): PublishOutcomeResult {
  if (outcome === "published") return { tone: "success", title: "Published to Explore", message: safetyMessage("Your project is live and discoverable in Explore.", result) };
  if (outcome === "under_review") return null;
  if (outcome === "private") return { tone: "info", title: "Saved privately", message: safetyMessage("Only you can view this published project.", result) };
  return { tone: "info", title: "Saved as unlisted", message: safetyMessage("Anyone with the link can view it, but it will not appear in Explore.", result) };
}

export function publishResultFromStatus(status?: ProjectPublishStatus | null): PublishFlowResult {
  const reviewStatus = status?.reviewStatus;
  if (!reviewStatus) return null;
  if (reviewStatus === "denied") return { tone: "danger", title: "Review denied", message: safetyMessage(status?.reviewReason || "This project needs changes before it can appear in Explore.", status) };
  if (reviewStatus === "under_review" || reviewStatus === "pending") return null;
  if (status?.visibility === "private") return { tone: "info", title: "Saved privately", message: safetyMessage("Only you can view this published project.", status) };
  if (status?.visibility === "unlisted") return { tone: "info", title: "Saved as unlisted", message: safetyMessage("Anyone with the link can view it, but it will not appear in Explore.", status) };
  if (reviewStatus === "approved") return { tone: "success", title: "Project approved", message: safetyMessage("Your project is approved and visible in Explore.", status) };
  return null;
}

export function publishStatusLabel(status?: ProjectPublishStatus | null) {
  if (!status?.reviewStatus) return "";
  if (status.reviewStatus === "denied") return "Denied";
  if (status.reviewStatus === "under_review" || status.reviewStatus === "pending") return "";
  if (status.visibility === "private") return "Private";
  if (status.visibility === "unlisted") return "Unlisted";
  if (status.reviewStatus === "approved") return "Approved";
  return "Review";
}

export function isPublishReviewLocked(status?: ProjectPublishStatus | null) {
  return false;
}

function safetyMessage(base: string, item?: SafetyResultInfo | null) {
  const rating = safetyRatingLabel(item?.safetyRating);
  const score = typeof item?.safetyScore === "number" ? ` ${item.safetyScore}/100` : "";
  const safety = rating ? ` Safety: ${rating}${score}.` : "";
  const hosting = hostingMessage(item?.hostedDemoStatus);
  return `${base}${safety}${hosting}`;
}

function safetyRatingLabel(value?: string) {
  if (!value) return "";
  return value.split("_").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
}

function hostingMessage(status?: string | null) {
  if (status === "ready") return " Hosted demo ready.";
  if (status === "pending") return " Hosted demo pending.";
  if (status === "failed") return " Hosted demo unavailable.";
  return "";
}
