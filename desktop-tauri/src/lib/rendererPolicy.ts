import type { RendererMode, RendererPolicy } from "../types";

// Pure counterpart to `src-tauri/src/renderer.rs`. Keep the two in step: Rust
// decides the compositing path before the webview exists, and these functions
// decide what the UI says about it and which xterm renderer to attach.

/** Linux uses DOM terminals to avoid WebGL buffer presentation problems,
 * alongside shared-memory compositing by default. macOS and Windows keep
 * the faster WebGL addon. */
export function webglIsTrustworthy(probe: Pick<RendererPolicy, "softwareCompositing" | "configurable"> | null): boolean {
  return probe !== null && !probe.configurable && !probe.softwareCompositing;
}

/** What the selected mode would resolve to on the next launch. */
export function resolvesToSharedMemory(mode: RendererMode, _nvidiaSession: boolean): boolean {
  if (mode === "compatibility") return true;
  if (mode === "accelerated") return false;
  return true;
}

/**
 * True when the saved mode would produce a different path than the one
 * running now. Compared against the live policy rather than the mode read at
 * mount, which goes stale the moment the user picks a different one, and
 * suppressed when the environment is overriding the setting anyway.
 */
export function rendererNeedsRestart(mode: RendererMode, policy: RendererPolicy): boolean {
  if (policy.environmentOverride) return false;
  return resolvesToSharedMemory(mode, policy.nvidiaSession) !== policy.softwareCompositing;
}
