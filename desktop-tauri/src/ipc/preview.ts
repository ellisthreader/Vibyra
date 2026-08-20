import { invoke } from "@tauri-apps/api/core";

import type { PreviewInspection, PreviewStatus } from "../previewTypes";

export function inspectPreview(root: string): Promise<PreviewInspection> {
  return invoke("preview_inspect", { root });
}

export function startPreview(root: string, targetId: string): Promise<PreviewStatus> {
  return invoke("preview_start", { root, targetId });
}

export function getPreviewStatus(root: string, targetId: string): Promise<PreviewStatus> {
  return invoke("preview_status", { root, targetId });
}

export function stopPreview(root: string, targetId: string): Promise<PreviewStatus> {
  return invoke("preview_stop", { root, targetId });
}

export function stopProjectPreviews(root: string): Promise<void> {
  return invoke("preview_stop_project", { root });
}
