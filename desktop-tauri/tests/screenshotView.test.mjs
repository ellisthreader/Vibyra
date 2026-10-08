import assert from "node:assert/strict";
import test from "node:test";

import { fitScreenshotView, sameScreenshotView } from "../src/lib/screenshotView.ts";

const CAPTURE = { width: 1920, height: 1080 };

test("fits the capture inside the stage without upscaling it", () => {
  const view = fitScreenshotView({ width: 1200, height: 900 }, CAPTURE, 1);
  assert.equal(view.cssWidth, 1200);
  assert.equal(view.cssHeight, 675);
  assert.equal(view.width, 1200);
  assert.equal(view.scale, 1200 / 1920);
});

test("a stage larger than the capture presents it 1:1", () => {
  const view = fitScreenshotView({ width: 3000, height: 2000 }, CAPTURE, 1);
  assert.equal(view.cssWidth, 1920);
  assert.equal(view.width, 1920);
  assert.equal(view.scale, 1);
});

test("never allocates more device pixels than the capture holds", () => {
  const view = fitScreenshotView({ width: 1200, height: 900 }, CAPTURE, 3);
  assert.equal(view.cssWidth, 1200);
  assert.equal(view.width, 1920);
  assert.equal(view.scale, 1);
});

test("an unmeasured stage or an empty capture yields no view", () => {
  assert.equal(fitScreenshotView({ width: 0, height: 0 }, CAPTURE, 1).width, 0);
  assert.equal(fitScreenshotView({ width: 800, height: 600 }, { width: 0, height: 0 }, 1).width, 0);
});

test("only a changed layer size counts as a resize", () => {
  const box = { width: 1200, height: 900 };
  const first = fitScreenshotView(box, CAPTURE, 1);
  assert.ok(sameScreenshotView(first, fitScreenshotView(box, CAPTURE, 1)));
  assert.ok(!sameScreenshotView(first, fitScreenshotView({ width: 1199, height: 900 }, CAPTURE, 1)));
});
