import assert from "node:assert/strict";
import test from "node:test";

import {
  rendererNeedsRestart,
  resolvesToSharedMemory,
  webglIsTrustworthy,
} from "../src/lib/rendererPolicy.ts";

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

test("Linux terminals use DOM even on the accelerated WebKit path", () => {
  assert.equal(webglIsTrustworthy({ configurable: true, softwareCompositing: false }), false);
  assert.equal(webglIsTrustworthy({ configurable: true, softwareCompositing: true }), false);
  assert.equal(webglIsTrustworthy({ configurable: false, softwareCompositing: false }), true);
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
