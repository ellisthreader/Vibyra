import type { Terminal } from "@xterm/xterm";

import { rendererPolicy } from "../ipc/render";
import { useNotificationStore } from "../state/notificationStore";
import { webglIsTrustworthy } from "./rendererPolicy";

// Under WebKit's shared-memory compositing path (DMA-BUF renderer disabled),
// WebGL canvases silently fail to composite: xterm's WebGL addon loads, the
// buffer fills, and the terminal stays black — the blank-pane-on-spawn bug.
// Renderer strings can't detect this (WebKitGTK's ANGLE reports bogus names
// like "Apple GPU"), so Rust tells us which compositing mode the webview got
// and we only trust WebGL on the accelerated path.

/** Loaded only on the accelerated path; null means "use the DOM renderer". */
let WebglAddon: (typeof import("@xterm/addon-webgl"))["WebglAddon"] | null = null;
let policyReady: Promise<void> | null = null;

/** Resolve the renderer policy once, before the first terminal mounts. */
export function initRendererPolicy(): Promise<void> {
  policyReady ??= rendererPolicy()
    .then(async (policy) => {
      if (!webglIsTrustworthy(policy)) return;
      // Everyone on shared-memory compositing would otherwise parse ~124 kB of
      // addon they can never use, so it is fetched only once the probe says the
      // accelerated path won. Awaited here rather than in `attachRenderer` so
      // that stays synchronous: this settles long before a terminal can mount.
      ({ WebglAddon } = await import("@xterm/addon-webgl"));
    })
    .catch(() => {
      // A failed probe — or a failed addon load — means the DOM renderer,
      // which is always correct.
      WebglAddon = null;
    });
  return policyReady;
}

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

/** WebGL on the accelerated path (context loss disposes it → DOM fallback);
 * the always-correct DOM renderer everywhere else. */
export function attachRenderer(term: Terminal): void {
  if (!WebglAddon) return;
  try {
    const webgl = new WebglAddon();
    term.loadAddon(webgl);
    webgl.onContextLoss(() => {
      webgl.dispose();
      reportContextLoss();
    });
  } catch {
    // WebGL unavailable — xterm falls back to the DOM renderer.
  }
}
