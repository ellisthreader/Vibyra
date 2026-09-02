import assert from "node:assert/strict";
import test from "node:test";

import { orbMotion } from "../src/lib/voiceOrbPaint.ts";

// The rule this file exists to hold: reduced motion may take the decoration,
// and it may stop the sweep, but it may never stop a reading. The orb shipped
// once with a single `hasAttribute("data-reduce-motion")` check that skipped
// the frame loop outright, so for anyone on maximum performance — which turns
// reduced motion on — the ring stood perfectly still through every spoken
// exchange. A frozen meter and a dead microphone look exactly the same.

test("a reading keeps animating even when motion is reduced", () => {
  for (const mode of ["listening", "speaking"]) {
    assert.equal(orbMotion(mode, true).live, true, `${mode} must stay live`);
  }
});

test("the sweep may stand still, because it is measuring nothing", () => {
  assert.equal(orbMotion("thinking", true).live, false);
  assert.equal(orbMotion("thinking", false).live, true);
});

test("nothing runs when the orb is not on screen", () => {
  for (const reduced of [true, false]) {
    assert.equal(orbMotion("idle", reduced).live, false);
  }
});

test("reduced motion always drops the decoration, and only the decoration", () => {
  for (const mode of ["idle", "listening", "thinking", "speaking"]) {
    assert.equal(orbMotion(mode, true).flourish, false, mode);
    assert.equal(orbMotion(mode, false).flourish, true, mode);
  }
});

test("with motion allowed, every visible mode animates", () => {
  for (const mode of ["listening", "thinking", "speaking"]) {
    assert.equal(orbMotion(mode, false).live, true, mode);
  }
});
