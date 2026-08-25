import type { Terminal } from "@xterm/xterm";

import { rendererPolicy } from "../ipc/render";
import { useNotificationStore } from "../state/notificationStore";
import { webglIsTrustworthy } from "./rendererPolicy";
import { createRendererLoader } from "./terminalRendererLoader";

// Under WebKit's shared-memory compositing path (DMA-BUF renderer disabled),
// WebGL canvases silently fail to composite: xterm's WebGL addon loads, the
// buffer fills, and the terminal stays black — the blank-pane-on-spawn bug.
// Renderer strings can't detect this (WebKitGTK's ANGLE reports bogus names
// like "Apple GPU"), so Rust tells us which compositing mode the webview got
// and we only trust WebGL on the accelerated path.

type WebglAddonConstructor = (typeof import("@xterm/addon-webgl"))["WebglAddon"];
let policyReady: Promise<WebglAddonConstructor | null> | null = null;

/** Resolve the renderer policy and addon once; every terminal awaits it. */
export function initRendererPolicy(): Promise<WebglAddonConstructor | null> {
  policyReady ??= rendererPolicy()
    .then(async (policy) => {
      if (!webglIsTrustworthy(policy)) return null;
      // Everyone on shared-memory compositing would otherwise parse ~124 kB of
      // addon they can never use, so it is fetched only once the probe says the
      // accelerated path won.
      return (await import("@xterm/addon-webgl")).WebglAddon;
    })
    .catch(() => {
      // A failed probe — or a failed addon load — means the DOM renderer,
      // which is always correct.
      return null;
    });
  return policyReady;
}

let contextLossReported = false;
const contextLost = new WeakSet<Terminal>();
const rendererWired = new WeakSet<Terminal>();

/** Losing the GPU context silently drops every terminal to the DOM renderer,
 * which is correct but noticeably slower. Say so once — a user watching their
 * terminals get sluggish deserves to know why, and that a restart fixes it. */
function reportContextLoss(): void {
  if (contextLossReported) return;
  contextLossReported = true;
  useNotificationStore.getState().push({
    kind: "performance",
    tier: "risk",
    title: "Terminals switched to the slower renderer",
    body: "The graphics context was lost, so Vibyra fell back to CPU drawing. Restarting Vibyra restores the accelerated path.",
    dedupeKey: "perf:context-loss",
    osEligible: false,
  });
}

const loadWebgl = createRendererLoader<Terminal, InstanceType<WebglAddonConstructor>>(
  initRendererPolicy,
  (term, addon) => term.loadAddon(addon),
  // React detaches the persistent host while a pane is hidden, but xterm's
  // element keeps its parent until the terminal is actually disposed.
  (term) => Boolean(term.element?.parentNode),
);

/** WebGL on the accelerated path (context loss disposes it → DOM fallback);
 * the always-correct DOM renderer everywhere else. */
export async function attachRenderer(
  term: Terminal,
  onChange: (renderer: "webgl" | "dom") => void = () => {},
): Promise<"webgl" | "dom"> {
  if (contextLost.has(term)) {
    onChange("dom");
    return "dom";
  }
  if (rendererWired.has(term)) {
    onChange("webgl");
    return "webgl";
  }
  try {
    const webgl = await loadWebgl(term);
    if (!webgl) {
      onChange("dom");
      return "dom";
    }
    // Two callers can reach the same pending loader before either continuation
    // runs. Only the first one owns renderer state and the context-loss hook.
    if (rendererWired.has(term)) {
      onChange(contextLost.has(term) ? "dom" : "webgl");
      return contextLost.has(term) ? "dom" : "webgl";
    }
    rendererWired.add(term);
    onChange("webgl");
    webgl.onContextLoss(() => {
      contextLost.add(term);
      webgl.dispose();
      onChange("dom");
      reportContextLoss();
    });
    return "webgl";
  } catch {
    // WebGL unavailable — xterm falls back to the DOM renderer.
    onChange("dom");
    return "dom";
  }
}
