export type PreviewDeviceHint = "phone" | "tablet" | "laptop" | "desktop" | "tv";
export type PreviewPhase = "idle" | "starting" | "running" | "failed" | "stopped";
/** Absent means web: a page in the Preview frame. Desktop runs as a window. */
export type PreviewTargetKind = "web" | "desktop";
export type DesktopStage = "building" | "waiting_for_window" | "ready" | "exited" | "timed_out";

export interface PreviewTarget {
  id: string;
  name: string;
  framework: string;
  relativeRoot: string;
  command: string | null;
  runnable: boolean;
  reason: string | null;
  deviceHint: PreviewDeviceHint;
  landscape: boolean;
  kind?: PreviewTargetKind;
}

export interface PreviewInspection {
  projectRoot: string;
  targets: PreviewTarget[];
}

export interface PreviewStatus {
  phase: PreviewPhase;
  targetId: string;
  url: string | null;
  command: string | null;
  logs: string[];
  error: string | null;
  stage?: DesktopStage;
  windows?: { pid: number; id: number; fingerprint: string }[];
}

export type PreviewDeviceKind =
  | "phone"
  | "foldable"
  | "tablet"
  | "laptop"
  | "desktop"
  | "tv"
  | "custom";

export interface PreviewDevice {
  key: string;
  label: string;
  group: string;
  kind: PreviewDeviceKind;
  width: number;
  height: number;
  dpr: number;
  radius: number;
  screenRadius: number;
  camera: "island" | "notch" | "dot" | "none";
}

export interface PreviewViewportState {
  deviceKey: string;
  landscape: boolean;
  zoom: number;
  customWidth: number;
  customHeight: number;
}
