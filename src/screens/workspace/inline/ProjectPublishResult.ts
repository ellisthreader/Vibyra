import type { ProjectPublishStatus, PublishProjectOutcome } from "../../../utils/communityApi";
import { hasFailedCandidate, hasPendingCandidate, projectPublishStatusLabel } from "./ProjectPublishLifecycle";

export type PublishFlowResult = {
  message: string;
  showReleaseProgress?: boolean;
  title: string;
  tone: "success" | "info" | "danger";
} | null;
type PublishOutcomeResult = PublishFlowResult;
export type PublishProgressStage = {
  message: string;
  title: string;
};
export type PublishDeploymentProgress = {
  estimate: string;
  percent: number;
  step: string;
};
type SafetyResultInfo = {
  deploymentStatus?: string | null;
  hostedDemoStatus?: string | null;
  publishStatus?: ProjectPublishStatus;
  reviewStatus?: string;
  reviewSummary?: string | null;
  safetyRating?: string;
  safetyScore?: number;
};

export function publishResultFromOutcome(
  outcome: PublishProjectOutcome,
  _result?: SafetyResultInfo,
  release: "first" | "update" = "first"
): PublishOutcomeResult {
  if (outcome === "under_review") {
    return { tone: "info", title: "Changes submitted", message: "We’ll start publishing after the project check finishes.", showReleaseProgress: true };
  }
  if (outcome === "published") {
    return release === "update"
      ? { tone: "info", title: "New version is publishing", message: "Your current live version stays available while the update is prepared.", showReleaseProgress: true }
      : { tone: "info", title: "Publishing started", message: "Your listing was created and its first live version is being prepared.", showReleaseProgress: true };
  }
  if (outcome === "private") return { tone: "success", title: "Visibility changed", message: "The listing is now private and hosting has stopped." };
  return { tone: "success", title: "Visibility changed", message: "The listing is no longer discoverable in Explore." };
}

export function publishResultFromStatus(status?: ProjectPublishStatus | null): PublishFlowResult {
  if (!status) return null;
  const label = projectPublishStatusLabel(status);
  if (label === "Live + Updating") {
    return { tone: "info", title: "Live · Updating", message: "The current version is live while a new version is publishing." };
  }
  if (label === "Live + Update failed") {
    return { tone: "danger", title: "Live · Update failed", message: status.candidateError || "The current version is still live. Fix the project and resubmit the update." };
  }
  if (status.reviewStatus === "denied") {
    return { tone: "danger", title: "Changes needed", message: status.candidateError || status.reviewReason || "Fix the project and resubmit it for publishing." };
  }
  if (hasFailedCandidate(status)) return deploymentResult(status);
  if (status.reviewStatus === "under_review" || status.reviewStatus === "pending") {
    return { tone: "info", title: "Checking your project", message: "We’re running a quick safety check before publishing starts." };
  }
  if (status?.visibility === "private") return { tone: "info", title: "Saved privately", message: "Only you can view this published project." };
  if (label === "Live") return { tone: "success", title: "Your app is live", message: "The current version is available in Explore." };
  if (hasPendingCandidate(status) || status.reviewStatus === "approved") return deploymentResult(status);
  return null;
}

export function publishStatusLabel(status?: ProjectPublishStatus | null) {
  return projectPublishStatusLabel(status);
}

export function isPublishReviewLocked(status?: ProjectPublishStatus | null) {
  return false;
}

export function isPublishStatusPending(status?: ProjectPublishStatus | null) {
  return Boolean(status && (
    hasPendingCandidate(status)
    || status.reviewStatus === "under_review"
    || status.reviewStatus === "pending"
    || ["pending", "pending_review", "under_review"].includes(status.listingState || "")
  ));
}

export function publishProgressFromStatus(status?: ProjectPublishStatus | null, now = Date.now()): PublishDeploymentProgress | null {
  if (!status || status.visibility === "private" || status.visibility === "unlisted") return null;
  if (status.reviewStatus === "under_review" || status.reviewStatus === "pending") {
    return { estimate: "Usually less than a minute.", percent: 8, step: "Quick safety check" };
  }
  const deployment = status.candidateReleaseState || status.deploymentStatus || "";
  if (!hasPendingCandidate(status) && (deployment === "live" || deployment === "static_live" || status.currentReleaseState === "live" || status.hostedDemoStatus === "ready")) {
    return { estimate: "Your app is ready to open in Explore.", percent: 100, step: "Published" };
  }
  const stages: Record<string, { base: number; estimate: string; expectedMs: number; span: number; step: string }> = {
    pending_review: { base: 12, estimate: "Most apps are live in about 2–5 minutes.", expectedMs: 60_000, span: 11, step: "Step 1 of 4 · Waiting to start" },
    queued: { base: 12, estimate: "Most apps are live in about 2–5 minutes.", expectedMs: 60_000, span: 11, step: "Step 1 of 4 · Waiting to start" },
    uploading: { base: 25, estimate: "Usually less than 4 minutes remaining.", expectedMs: 45_000, span: 11, step: "Step 2 of 4 · Uploading files" },
    building: { base: 40, estimate: "Usually 1–3 minutes remaining.", expectedMs: 180_000, span: 38, step: "Step 3 of 4 · Building your app" },
    starting: { base: 82, estimate: "Usually less than 2 minutes remaining.", expectedMs: 90_000, span: 14, step: "Step 4 of 4 · Final checks" }
  };
  const stage = stages[deployment];
  if (!stage) return null;
  const updatedAt = Date.parse(status.deploymentUpdatedAt || status.updatedAt || "");
  const elapsed = Number.isFinite(updatedAt) ? Math.max(0, now - updatedAt) : 0;
  const withinStage = Math.min(stage.span, Math.floor((elapsed / stage.expectedMs) * stage.span));
  return { estimate: stage.estimate, percent: stage.base + withinStage, step: stage.step };
}

function deploymentResult(status: ProjectPublishStatus): NonNullable<PublishFlowResult> {
  const deployment = status.candidateReleaseState || status.deploymentStatus || "";
  if (hasFailedCandidate(status)) return { tone: "danger", title: "We couldn’t publish this build", message: status.candidateError || status.hostedDemoMessage || "Open the project and try publishing again." };
  if (deployment === "stopped") return { tone: "danger", title: "This app is no longer live", message: "Publish the project again to restart it." };
  if (deployment === "queued" || deployment === "pending_review") return { tone: "info", title: "Your app is in line", message: "We’re preparing a secure build machine. You can leave this screen and check back later." };
  if (deployment === "uploading") return { tone: "info", title: "Uploading your app", message: "Your project files are being sent securely." };
  if (deployment === "building") return { tone: "info", title: "Building your app", message: "We’re preparing the live frontend and backend." };
  if (deployment === "starting") return { tone: "info", title: "Final checks", message: "Your app is built. We’re starting it and checking the public link." };
  if (deployment === "live" || deployment === "static_live" || status.hostedDemoStatus === "ready") {
    return { tone: "success", title: "Your app is live", message: "It is now published and ready to open in Explore." };
  }
  return { tone: "info", title: "Preparing your app", message: "Publishing has started. We’ll update this screen as it moves forward." };
}
