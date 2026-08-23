import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeRendererMode,
  rendererNeedsRestart,
  resolvesToSharedMemory,
  webglIsTrustworthy,
} from "../src/lib/rendererPolicy.ts";

test("invalid persisted graphics modes normalize to Automatic", () => {
  assert.equal(normalizeRendererMode("accelerated"), "accelerated");
  assert.equal(normalizeRendererMode("compatibility"), "compatibility");
  assert.equal(normalizeRendererMode("auto"), "auto");
  assert.equal(normalizeRendererMode("legacy-value"), "auto");
  assert.equal(normalizeRendererMode(undefined), "auto");
});

function policy(overrides = {}) {
  return {
    mode: "auto",
    softwareCompositing: false,
    nvidiaSession: false,
    configurable: true,
    environmentOverride: false,
    ...overrides,
  };
}

test("WebGL is trusted only on the accelerated path", () => {
  assert.equal(webglIsTrustworthy({ softwareCompositing: false }), true);
  assert.equal(webglIsTrustworthy({ softwareCompositing: true }), false);
});

test("a failed compositing probe falls back to the DOM renderer", () => {
  // Guessing WebGL here is the blank-terminal bug; the DOM renderer is slower
  // but always paints.
  assert.equal(webglIsTrustworthy(null), false);
});

test("explicit modes resolve without consulting detection", () => {
  assert.equal(resolvesToSharedMemory("compatibility", false), true);
  assert.equal(resolvesToSharedMemory("accelerated", true), false);
});

test("auto follows the NVIDIA detection, matching the Rust policy", () => {
  assert.equal(resolvesToSharedMemory("auto", true), true);
  assert.equal(resolvesToSharedMemory("auto", false), false);
});

test("a restart is needed only when the saved mode changes the path", () => {
  assert.equal(rendererNeedsRestart("auto", policy({ nvidiaSession: false })), false);
  assert.equal(rendererNeedsRestart("compatibility", policy()), true);
  assert.equal(
    rendererNeedsRestart("accelerated", policy({ softwareCompositing: true })),
    true,
  );
  assert.equal(
    rendererNeedsRestart("compatibility", policy({ softwareCompositing: true })),
    false,
  );
});

test("an environment override never promises that a restart will apply", () => {
  const forced = policy({ softwareCompositing: true, environmentOverride: true });
  assert.equal(rendererNeedsRestart("accelerated", forced), false);
});
