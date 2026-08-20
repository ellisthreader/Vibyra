import type { Terminal } from "@xterm/xterm";
import { WebglAddon } from "@xterm/addon-webgl";

import { rendererPolicy } from "../ipc/render";
import { webglIsTrustworthy } from "./rendererPolicy";

// Under WebKit's shared-memory compositing path (DMA-BUF renderer disabled),
// WebGL canvases silently fail to composite: xterm's WebGL addon loads, the
// buffer fills, and the terminal stays black — the blank-pane-on-spawn bug.
// Renderer strings can't detect this (WebKitGTK's ANGLE reports bogus names
// like "Apple GPU"), so Rust tells us which compositing mode the webview got
// and we only trust WebGL on the accelerated path.

let webglTrusted = false;
let policyReady: Promise<void> | null = null;

/** Resolve the renderer policy once, before the first terminal mounts. */
export function initRendererPolicy(): Promise<void> {
  policyReady ??= rendererPolicy()
    .then((policy) => {
      webglTrusted = webglIsTrustworthy(policy);
    })
    .catch(() => {
      webglTrusted = webglIsTrustworthy(null);
    });
  return policyReady;
}

/** WebGL on the accelerated path (context loss disposes it → DOM fallback);
 * the always-correct DOM renderer everywhere else. */
export function attachRenderer(term: Terminal): void {
  if (!webglTrusted) return;
  try {
    const webgl = new WebglAddon();
    term.loadAddon(webgl);
    webgl.onContextLoss(() => webgl.dispose());
  } catch {
    // WebGL unavailable — xterm falls back to the DOM renderer.
  }
}
