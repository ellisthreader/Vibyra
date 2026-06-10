import { publishProject as publishCommunityProject } from "../../../utils/communityApi";
import { pickPreviewHtml } from "../../../utils/files";
import {
  requestHostedDemoBundle, requestHostedRuntimeBundle, runtimeBundleHostingError, runtimeBundleIncludesFrontend,
  type HostedDemoPayload, type HostedRuntimePayload
} from "../../../utils/hostedDemo";
import type { ProjectDisplay } from "../types";
import type { ProjectListingPayload } from "./ProjectPublishModal.data";
import type { PublishProgressStage } from "./ProjectPublishResult";

type AppContextValue = ReturnType<typeof import("../../../context/AppContext").useAppContext>;

export async function publishProjectRelease({
  app, onProgress, payload, project
}: {
  app: AppContextValue;
  onProgress: (stage: PublishProgressStage) => void;
  payload: ProjectListingPayload;
  project: ProjectDisplay;
}) {
  if (!app.authToken) throw new Error("Log in before publishing a project.");
  const identity = publishProjectIdentity(project);
  onProgress({ title: "Reading project", message: "Loading the project files needed for a safe public build." });
  if (project.sourceProject && !app.projects.some((item) => item.id === identity.projectId)) {
    onProgress({ title: "Adding project", message: "Linking this desktop project to your Vibyra account." });
    await app.adoptProject(project.sourceProject);
  }
  const files = project.sourceProject
    ? await app.selectProject(identity.projectId, project.sourceProject, { startPreview: false })
    : await app.selectProject(identity.projectId, { startPreview: false });
  const previewHtml = pickPreviewHtml(files, false);
  onProgress({ title: "Checking source", message: "Reviewing the files that will be included in the published app." });
  const sourceReview = await app.loadProjectReviewFiles(identity.projectId, identity.projectPath);
  onProgress({ title: "Preparing backend", message: "Detecting and packaging the live server runtime." });
  const runtimeBundle = await requestHostedRuntimeBundle({
    agentUrl: app.agentUrl, connection: app.connection, projectId: identity.projectId,
    projectPath: identity.projectPath
  });
  const runtimeHostingError = runtimeBundleHostingError(runtimeBundle);
  if (payload.visibility === "public" && runtimeHostingError) throw new Error(runtimeHostingError);
  const requiredRuntimeError = requiredRuntimePublishError(runtimeBundle);
  if (payload.visibility === "public" && requiredRuntimeError) throw new Error(requiredRuntimeError);
  const includesFrontend = runtimeBundleIncludesFrontend(runtimeBundle);
  onProgress({
    title: includesFrontend ? "Frontend included" : "Preparing frontend",
    message: includesFrontend ? "The frontend and backend will be deployed together." : "Building the browser app and collecting its public assets."
  });
  const hostedDemo = includesFrontend ? null : await requestHostedDemoBundle({
    agentUrl: app.agentUrl, connection: app.connection, projectId: identity.projectId,
    projectPath: identity.projectPath
  });
  const previewError = publicPreviewPublishError({
    hostedDemo, previewHtml, projectPath: identity.projectPath, runtimeBundle, visibility: payload.visibility
  });
  if (previewError) throw new Error(previewError);
  onProgress({ title: "Submitting publish", message: "Uploading the approved bundle and creating its Explore listing." });
  return publishCommunityProject({
    authToken: app.authToken,
    capabilities: publishCapabilities({ hostedDemo, previewHtml, runtimeBundle }),
    description: payload.description,
    hostedDemo,
    logoImageUrl: payload.logoImageUrl,
    previewHtml,
    projectId: identity.projectId,
    runtimeBundle,
    screenshotUrls: payload.screenshotUrls,
    sourceFiles: sourceReview.files,
    sourceReview: { totalFiles: sourceReview.totalFiles, truncated: sourceReview.truncated },
    stack: project.stack,
    tags: payload.tags,
    title: payload.title,
    visibility: payload.visibility
  });
}

export function publishProjectIdentity(project: ProjectDisplay) {
  return {
    projectId: project.sourceProject?.id || project.id,
    projectPath: project.sourceProject?.path || project.path
  };
}

export function publishCapabilities({
  hostedDemo, previewHtml, runtimeBundle
}: {
  hostedDemo: HostedDemoPayload | null;
  previewHtml: string;
  runtimeBundle: HostedRuntimePayload | null;
}) {
  return {
    backend: runtimeBundle?.ok === true,
    frontend: runtimeBundleIncludesFrontend(runtimeBundle)
      || hostedDemo?.ok === true
      || hasOpenablePublishHtml(previewHtml)
  };
}

export function publicPreviewPublishError({
  hostedDemo, previewHtml, projectPath, runtimeBundle, visibility
}: {
  hostedDemo: HostedDemoPayload | null;
  previewHtml: string;
  projectPath: string;
  runtimeBundle: HostedRuntimePayload | null;
  visibility: "public" | "private";
}) {
  if (visibility !== "public") return "";
  if (hasOpenablePublishHtml(previewHtml) || hostedDemo?.ok === true || runtimeBundle?.ok === true) return "";
  const reasons = uniqueMessages([hostedDemo?.message, runtimeBundle?.message]);
  if (reasons.some(isProjectNotFoundMessage)) {
    const location = projectPath.trim() ? ` (${projectPath.trim()})` : "";
    return `Vibyra Desktop could not find this project folder${location}. Reopen the actual app folder from Browse PC, then publish again.`;
  }
  if (reasons.length > 0) return reasons.join(" ");
  return "This folder does not have a publishable public app preview yet. Open the actual app folder from Browse PC, make sure it has a built browser entry or a supported start/build script, then publish again.";
}

function hasOpenablePublishHtml(html: string) {
  const trimmed = html.trim();
  if (!trimmed) return false;
  const normalized = trimmed.toLowerCase().replace(/\s+/g, " ");
  return !(normalized.includes("<h2>project preview</h2>") && normalized.includes("<pre><code>") && normalized.includes("</code></pre>"));
}

function requiredRuntimePublishError(runtimeBundle: HostedRuntimePayload | null) {
  if (!runtimeBundle || runtimeBundle.ok === true) return "";
  if (runtimeBundle.needsRuntime !== true && !runtimeBundle.platform) return "";
  return runtimeBundle.message?.trim()
    || "This project needs a live backend, but Vibyra Desktop could not prepare its runtime bundle.";
}

function uniqueMessages(messages: Array<string | null | undefined>) {
  const seen = new Set<string>();
  return messages.flatMap((message) => {
    const trimmed = message?.trim();
    if (!trimmed) return [];
    const key = trimmed.toLowerCase().replace(/[.!?]+$/g, "");
    if (seen.has(key)) return [];
    seen.add(key);
    return [trimmed];
  });
}

function isProjectNotFoundMessage(message: string) {
  return /^project not found[.!]?$/i.test(message.trim());
}
