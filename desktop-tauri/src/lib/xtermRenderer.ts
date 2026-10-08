import type { Terminal } from "@xterm/xterm";
import { WebglAddon } from "@xterm/addon-webgl";

import { useNotificationStore } from "../state/notificationStore";
import { webglIsTrusted } from "./webglTrust";

// Attaches the renderer `webglTrust.ts` decided on. That file resolves the
// policy at startup; this one is the only importer of the WebGL addon, so
// nothing reaches it before a terminal exists.

/** Hands back the GPU context a terminal's renderer held; call it after
 * `term.dispose()`. A no-op for the DOM renderer. */
export type ReleaseRenderer = () => void;

const nothingToRelease: ReleaseRenderer = () => {};

let contextLossReported = false;

/** Losing the GPU context silently drops every terminal to the DOM renderer,
 * which is correct but noticeably slower. Say so once — a user watching their
 * terminals get sluggish deserves to know why, and that a restart fixes it. */
function reportContextLoss(): void {
  if (contextLossReported) return;
  contextLossReported = true;
  useNotificationStore.getState().push({
    category: "performance",
    severity: "warning",
    title: "Terminals switched to the slower renderer",
    body: "The graphics context was lost, so Vibyra fell back to CPU drawing. Restarting Vibyra restores the accelerated path.",
    dedupeKey: "perf:context-loss",
    osEligible: false,
  });
}

/**
 * Disposing the addon only removes its canvas: the context stays live until
 * garbage collection, and WebKit caps live contexts (~16) by force-losing the
 * oldest — a pane still on screen, which then drops to the DOM renderer for
 * the rest of the run. Hibernate/wake churn outruns the collector easily.
 *
 * So the context is released deliberately. It is the addon's own, read off
 * its renderer (private fields, checked against addon-webgl 0.19), never a
 * fresh `getContext` call; and it is only lost after `term.dispose()` has
 * removed xterm's context-lost listener, so no toast blames the GPU.
 */
function releaseFor(webgl: WebglAddon): ReleaseRenderer {
  const gl = (webgl as unknown as { _renderer?: { _gl?: WebGL2RenderingContext } })._renderer?._gl;
  if (!gl) return nothingToRelease;
  return () => {
    if (!gl.isContextLost()) gl.getExtension("WEBGL_lose_context")?.loseContext();
  };
}

/** WebGL on the accelerated path (context loss disposes it → DOM fallback);
 * the always-correct DOM renderer everywhere else. */
export function attachRenderer(term: Terminal): ReleaseRenderer {
  if (!webglIsTrusted()) return nothingToRelease;
  try {
    const webgl = new WebglAddon();
    term.loadAddon(webgl);
    webgl.onContextLoss(() => {
      webgl.dispose();
      reportContextLoss();
    });
    return releaseFor(webgl);
  } catch {
    // WebGL unavailable — xterm falls back to the DOM renderer.
    return nothingToRelease;
  }
}
