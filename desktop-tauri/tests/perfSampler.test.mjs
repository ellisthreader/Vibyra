import assert from "node:assert/strict";
import test from "node:test";

import { nextEma } from "../src/lib/perfSampler.ts";

test("the first sample is taken at face value", () => {
  assert.equal(nextEma(null, 42), 42);
});

test("one stray spike cannot swing the average on its own", () => {
  // A single garbage-collection pause must not read as a struggling machine.
  const smoothed = nextEma(0, 1_000);
  assert.ok(smoothed < 1_000);
  assert.ok(smoothed > 0);
});

test("sustained load converges upward", () => {
  let value = 0;
  for (let index = 0; index < 12; index += 1) value = nextEma(value, 400);
  assert.ok(value > 390);
});

test("recovery converges back down", () => {
  let value = 800;
  for (let index = 0; index < 12; index += 1) value = nextEma(value, 0);
  assert.ok(value < 10);
});
