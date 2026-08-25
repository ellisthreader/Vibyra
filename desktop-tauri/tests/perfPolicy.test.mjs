import assert from "node:assert/strict";
import test from "node:test";

import {
  APP_CPU_DEGRADED,
  CPU_DEGRADED,
  RENDERER_CPU_DEGRADED,
  LAG_DEGRADED_MS,
  LAG_SEVERE_MS,
  MEM_DEGRADED,
  MEM_SEVERE,
  judge,
} from "../src/lib/perfPolicy.ts";
import { perfWindow } from "./perfWindow.mjs";

test("a quiet machine is ok", () => {
  assert.equal(judge(perfWindow()).level, "ok");
});

test("event-loop drift alone is enough to call it degraded", () => {
  assert.deepEqual(judge(perfWindow({ lagMs: LAG_DEGRADED_MS })), { level: "degraded", reason: "eventLoop" });
  assert.equal(judge(perfWindow({ lagMs: LAG_DEGRADED_MS - 1 })).level, "ok");
  assert.equal(judge(perfWindow({ lagMs: LAG_SEVERE_MS })).level, "severe");
});

test("memory outranks everything else because its fix is different", () => {
  const verdict = judge(perfWindow({ lagMs: LAG_SEVERE_MS, cpuPercent: 99, memRatio: MEM_SEVERE }));
  assert.deepEqual(verdict, { level: "severe", reason: "memory" });
});

test("compatibility compositing is named instead of blaming the machine", () => {
  // Same slowness, but this one has a one-switch remedy worth pointing at.
  const verdict = judge(perfWindow({ lagMs: LAG_DEGRADED_MS, softwareCompositing: true }));
  assert.deepEqual(verdict, { level: "degraded", reason: "compositing" });
});

test("Vibyra's own CPU counts even when the system looks calm", () => {
  assert.equal(judge(perfWindow({ appCpuPercent: APP_CPU_DEGRADED })).reason, "cpu");
  assert.equal(judge(perfWindow({ cpuPercent: CPU_DEGRADED })).reason, "cpu");
  assert.equal(judge(perfWindow({ memRatio: MEM_DEGRADED })).reason, "memory");
});

test("a saturated WebKit renderer counts even when the multicore machine looks calm", () => {
  const verdict = judge(perfWindow({ rendererCpuPercent: RENDERER_CPU_DEGRADED }));
  assert.deepEqual(verdict, { level: "degraded", reason: "cpu" });
  const compositing = judge(perfWindow({
    rendererCpuPercent: RENDERER_CPU_DEGRADED,
    softwareCompositing: true,
  }));
  assert.deepEqual(compositing, { level: "degraded", reason: "compositing" });
});

test("native samples are optional", () => {
  const verdict = judge(perfWindow({ cpuPercent: null, appCpuPercent: null, memRatio: null }));
  assert.equal(verdict.level, "ok");
});
