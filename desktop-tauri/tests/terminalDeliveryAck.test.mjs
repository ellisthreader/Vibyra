import assert from "node:assert/strict";
import test from "node:test";

import { createPaintReporter } from "../src/lib/terminalDeliveryAck.ts";

function harness() {
  const reported = [];
  const frames = [];
  const reporter = createPaintReporter(
    async (id) => {
      reported.push(id);
    },
    (callback) => frames.push(callback),
  );
  const paint = () => {
    const due = frames.splice(0);
    for (const frame of due) frame();
  };
  return { reporter, reported, frames, paint };
}

test("every pane written in a frame is reported once, after that frame", () => {
  const { reporter, reported, frames, paint } = harness();
  reporter(1);
  reporter(2);
  // A replayed queue writes the same pane many times in one frame; Rust only
  // needs to hear about the frame.
  reporter(1);
  assert.deepEqual(reported, []);
  assert.equal(frames.length, 1, "one frame is scheduled, not one per write");
  paint();
  assert.deepEqual(reported.sort(), [1, 2]);
});

test("the next frame starts fresh", () => {
  const { reporter, reported, paint } = harness();
  reporter(7);
  paint();
  reporter(7);
  paint();
  assert.deepEqual(reported, [7, 7]);
});

test("a rejected report never surfaces as an unhandled error", async () => {
  let frame = null;
  const reporter = createPaintReporter(
    () => Promise.reject(new Error("session not found")),
    (callback) => {
      frame = callback;
    },
  );
  reporter(3);
  frame();
  // Let the rejection settle; an unhandled one would fail the test process.
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.ok(true);
});
