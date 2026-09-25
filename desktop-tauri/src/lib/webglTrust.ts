import { rendererPolicy } from "../ipc/render";
import { webglIsTrustworthy } from "./rendererPolicy";

// Linux xterm uses the DOM renderer: WebGL can show a previous character on
// WebKit's accelerated path, and shared-memory compositing can leave its canvas
// black. Rust reports the platform and compositing mode before terminals mount.
//
// Split from `xtermRenderer.ts` so startup can resolve the policy without
// importing the WebGL addon: that file is the only one that attaches it.

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
