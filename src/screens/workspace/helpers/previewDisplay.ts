import type { FileEntry, GeneratedApp } from "../../../types/domain";
import { findIndexHtmlBody } from "../../../utils/files";
import { hasLocalPreviewDependencies } from "../../../utils/previewHtml";

export function isDisplayablePreview(app: GeneratedApp | null | undefined) {
  return Boolean(app?.html?.trim() || app?.url?.trim());
}

export function previewFingerprint(app: GeneratedApp) {
  return [
    app.id,
    app.projectId ?? "",
    app.source ?? "",
    app.title,
    app.url ?? "",
    app.html ?? ""
  ].join("\u0000");
}

export function hasRunnableLoadedFilePreview(files: FileEntry[]) {
  const html = findIndexHtmlBody(files);
  return Boolean(html?.trim() && !hasLocalPreviewDependencies(html));
}
