import assert from "node:assert/strict";
import test from "node:test";

import { HIGH_WATER, LOW_WATER, outputFlow } from "../src/lib/terminalFlow.ts";

function recorder() {
  const holds = [];
  let clock = 0;
  const flow = outputFlow((on) => holds.push(on), () => clock);
  return { holds, flow, advance: (ms) => { clock += ms; } };
}

test("ordinary output never asks Rust to hold", () => {
  const { holds, flow } = recorder();
  for (let i = 0; i < 1000; i += 1) flow.written(4096)();
  assert.deepEqual(holds, []);
});

test("a view behind its output holds once, and releases only below the low-water mark", () => {
  const { holds, flow } = recorder();
  const chunk = 1024 * 1024;
  const parsed = [];
  for (let i = 0; i < 4; i += 1) parsed.push(flow.written(chunk));
  assert.ok(4 * chunk > HIGH_WATER);
  assert.deepEqual(holds, [true], "one hold, not one per write");
  parsed.shift()();
  parsed.shift()();
  parsed.shift()();
  assert.deepEqual(holds, [true], "still above the low-water mark");
  assert.ok(chunk >= LOW_WATER);
  parsed.shift()();
  assert.deepEqual(holds, [true, false]);
});

test("a hold is renewed before Rust lets it lapse while the view is still behind", () => {
  const { holds, flow, advance } = recorder();
  flow.written(HIGH_WATER + 1);
  flow.written(1);
  assert.deepEqual(holds, [true]);
  advance(2_000);
  flow.written(1);
  assert.deepEqual(holds, [true, true]);
});
