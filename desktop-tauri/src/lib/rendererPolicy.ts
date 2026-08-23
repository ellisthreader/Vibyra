import type { RendererMode, RendererPolicy } from "../types";

// Pure counterpart to `src-tauri/src/renderer.rs`. Keep the two in step: Rust
// decides the compositing path before the webview exists, and these functions
// decide what the UI says about it and which xterm renderer to attach.

/** Invalid or older persisted values must behave as Automatic everywhere —
 * Rust already makes that startup choice, so the Settings UI and perf watch
 * must not disagree by leaving every choice unselected. */
export function normalizeRendererMode(value: unknown): RendererMode {
  return value === "accelerated" || value === "compatibility" ? value : "auto";
}

/**
 * WebGL only composites on WebKit's accelerated path. Under the shared-memory
 * renderer the addon loads, the buffer fills, and the pane stays black — so a
 * failed probe must fall back to the DOM renderer, which is always correct.
 */
export function webglIsTrustworthy(probe: Pick<RendererPolicy, "softwareCompositing"> | null): boolean {
  return probe !== null && !probe.softwareCompositing;
}

/** What the selected mode would resolve to on the next launch. */
export function resolvesToSharedMemory(mode: RendererMode, nvidiaSession: boolean): boolean {
  if (mode === "compatibility") return true;
  if (mode === "accelerated") return false;
  return nvidiaSession;
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
