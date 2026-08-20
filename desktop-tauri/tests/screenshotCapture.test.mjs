import assert from "node:assert/strict";
import test from "node:test";

import { capturedScreenshotFromBytes } from "../src/lib/screenshotCapture.ts";

function captureResponse(width, height, offset = 0) {
  const container = new Uint8Array(offset + 12 + (width * height * 4));
  const bytes = container.subarray(offset);
  bytes.set([86, 83, 72, 1]);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  view.setUint32(4, width);
  view.setUint32(8, height);
  bytes.fill(127, 12);
  return bytes;
}

test("maps the native RGBA capture into a renderer-owned pixel buffer", () => {
  const response = captureResponse(2, 3);
  const screenshot = capturedScreenshotFromBytes(response);
  assert.equal(screenshot.width, 2);
  assert.equal(screenshot.height, 3);
  assert.equal(screenshot.pixels.byteLength, 24);
  assert.notEqual(screenshot.pixels.buffer, response.buffer);
  assert.equal(screenshot.pixels[0], 127);
});

test("supports a native response with a non-zero buffer offset", () => {
  const screenshot = capturedScreenshotFromBytes(captureResponse(3, 1, 8));
  assert.deepEqual([screenshot.width, screenshot.height, screenshot.pixels.length], [3, 1, 12]);
});

test("rejects malformed or truncated native capture responses", () => {
  assert.throws(() => capturedScreenshotFromBytes(new Uint8Array(12)), /response is invalid/);
  assert.throws(() => capturedScreenshotFromBytes(captureResponse(0, 2)), /dimensions are invalid/);
  assert.throws(() => capturedScreenshotFromBytes(captureResponse(2, 2).subarray(0, 20)), /dimensions are invalid/);
});
