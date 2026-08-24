import assert from "node:assert/strict";
import test from "node:test";

import {
  countMarkers,
  phaseReport,
  resolveEchoes,
  summarize,
} from "../src/probe/probeStats.ts";

const key = (sent) => ({ sent, event: null, parse: null, paint: null });

test("echoes resolve keystrokes strictly first-in first-out", () => {
  const pending = [key(1), key(2), key(3)];
  const resolved = resolveEchoes(pending, 2, 10);
  assert.deepEqual(resolved.map((sample) => sample.sent), [1, 2]);
  assert.ok(resolved.every((sample) => sample.event === 10));
  assert.equal(pending.length, 1);
});

test("more echoes than pending keys never fabricates a sample", () => {
  const pending = [key(1)];
  assert.equal(resolveEchoes(pending, 5, 10).length, 1);
  assert.equal(pending.length, 0);
});

test("marker counting sees every occurrence, multibyte included", () => {
  assert.equal(countMarkers("no marker here", "§"), 0);
  assert.equal(countMarkers("a§b§§c", "§"), 3);
});

test("summary percentiles come from the sorted distribution", () => {
  const summary = summarize([5, 1, 3, 2, 4]);
  assert.equal(summary.n, 5);
  assert.equal(summary.p50, 3);
  assert.equal(summary.max, 5);
  assert.equal(summary.mean, 3);
});

test("a phase report only measures keystrokes that reached the screen", () => {
  const painted = { sent: 0, event: 5, parse: 6, paint: 8 };
  const lost = key(0);
  const report = phaseReport("demo", [painted, lost], 1, [16, 17]);
  assert.equal(report.echo.n, 1);
  assert.equal(report.paint.max, 8);
  assert.equal(report.dropped, 1);
  assert.equal(report.frames.n, 2);
});
