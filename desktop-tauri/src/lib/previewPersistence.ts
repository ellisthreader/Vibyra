import type {
  PreviewDeviceHint,
  PreviewViewportState,
} from "../previewTypes";
import { isPreviewDeviceKey, recommendedDevice } from "./previewDevices";

const TARGET_KEY = "vibyra.tauri.previewTargets";
const VIEWPORT_KEY = "vibyra.tauri.previewViewports";
const MAX_VIEWPORTS = 80;

function readMap<T>(key: string): Record<string, T> {
  try {
    const value = JSON.parse(localStorage.getItem(key) ?? "{}");
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  } catch {
    return {};
  }
}

export function preferredTarget(projectId: string): string | null {
  return readMap<string>(TARGET_KEY)[projectId] ?? null;
}

export function savePreferredTarget(projectId: string, targetId: string): void {
  const targets = readMap<string>(TARGET_KEY);
  targets[projectId] = targetId;
  localStorage.setItem(TARGET_KEY, JSON.stringify(targets));
}

function viewportKey(projectId: string, targetId: string): string {
  return `${projectId}\n${targetId}`;
}

export function loadViewport(
  projectId: string,
  targetId: string,
  hint: PreviewDeviceHint,
  landscape: boolean,
): PreviewViewportState {
  const stored = readMap<PreviewViewportState & { updatedAt?: number }>(VIEWPORT_KEY)[
    viewportKey(projectId, targetId)
  ];
  if (stored && isPreviewDeviceKey(stored.deviceKey)) {
    return {
      deviceKey: stored.deviceKey,
      landscape: Boolean(stored.landscape),
      zoom: bounded(stored.zoom, 0.5, 1.6, 1),
      customWidth: bounded(stored.customWidth, 240, 7680, 1280),
      customHeight: bounded(stored.customHeight, 240, 4320, 800),
    };
  }
  return {
    deviceKey: recommendedDevice(hint).key,
    landscape,
    zoom: 1,
    customWidth: 1280,
    customHeight: 800,
  };
}

export function saveViewport(
  projectId: string,
  targetId: string,
  viewport: PreviewViewportState,
): void {
  const states = readMap<PreviewViewportState & { updatedAt: number }>(VIEWPORT_KEY);
  states[viewportKey(projectId, targetId)] = { ...viewport, updatedAt: Date.now() };
  const trimmed = Object.fromEntries(
    Object.entries(states)
      .sort((left, right) => right[1].updatedAt - left[1].updatedAt)
      .slice(0, MAX_VIEWPORTS),
  );
  localStorage.setItem(VIEWPORT_KEY, JSON.stringify(trimmed));
}

function bounded(value: number, minimum: number, maximum: number, fallback: number): number {
  return Number.isFinite(value) ? Math.min(maximum, Math.max(minimum, value)) : fallback;
}
