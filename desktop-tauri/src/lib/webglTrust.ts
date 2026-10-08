import { rendererPolicy } from "../ipc/render";
import { webglIsTrustworthy } from "./rendererPolicy";

// Under WebKit's shared-memory compositing path (DMA-BUF renderer disabled),
// WebGL canvases silently fail to composite: xterm's WebGL addon loads, the
// buffer fills, and the terminal stays black — the blank-pane-on-spawn bug.
// Renderer strings can't detect this (WebKitGTK's ANGLE reports bogus names
// like "Apple GPU"), so Rust tells us which compositing mode the webview got
// and we only trust WebGL on the accelerated path.
//
// Split from `xtermRenderer.ts` so startup can resolve the policy without
// importing the WebGL addon: that file is the only one that attaches it, and
// the sign-in screen has no terminal to attach it to.

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

/** Whether this run's compositing path can show a WebGL terminal. */
export function webglIsTrusted(): boolean {
  return webglTrusted;
}
