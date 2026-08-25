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
import {
  ENTER_SAMPLES,
  EXIT_SAMPLES,
  COOLDOWN_MS,
  MAX_PER_SESSION,
  WARMUP_MS,
  initialGuardState,
  nextGuardState,
} from "../src/lib/perfGuard.ts";

function window(overrides = {}) {
  return {
    lagMs: 0,
    cpuPercent: 10,
    appCpuPercent: 5,
    rendererCpuPercent: 0,
    memRatio: 0.4,
    softwareCompositing: false,
    autoGraphics: true,
    graphicsSwitchAvailable: true,
    workingPanes: 0,
    ...overrides,
  };
}

function context(overrides = {}) {
  return { uptimeMs: WARMUP_MS + 1_000, away: false, window: window(), ...overrides };
}

/** Feeds the same verdict in `count` times, returning the last result. */
function run(state, verdict, count, ctx, startAt = 1_000) {
  let result = { state, notify: null };
  for (let index = 0; index < count; index += 1) {
    result = nextGuardState(result.state, verdict, startAt + index * 1_000, ctx);
  }
  return result;
}

test("a quiet machine is ok", () => {
  assert.equal(judge(window()).level, "ok");
});

test("event-loop drift alone is enough to call it degraded", () => {
  assert.deepEqual(judge(window({ lagMs: LAG_DEGRADED_MS })), { level: "degraded", reason: "eventLoop" });
  assert.equal(judge(window({ lagMs: LAG_DEGRADED_MS - 1 })).level, "ok");
  assert.equal(judge(window({ lagMs: LAG_SEVERE_MS })).level, "severe");
});

test("memory outranks everything else because its fix is different", () => {
  const verdict = judge(window({ lagMs: LAG_SEVERE_MS, cpuPercent: 99, memRatio: MEM_SEVERE }));
  assert.deepEqual(verdict, { level: "severe", reason: "memory" });
});

test("compatibility compositing is named instead of blaming the machine", () => {
  // Same slowness, but this one has a one-switch remedy worth pointing at.
  const verdict = judge(window({ lagMs: LAG_DEGRADED_MS, softwareCompositing: true }));
  assert.deepEqual(verdict, { level: "degraded", reason: "compositing" });
});

test("Vibyra's own CPU counts even when the system looks calm", () => {
  assert.equal(judge(window({ appCpuPercent: APP_CPU_DEGRADED })).reason, "cpu");
  assert.equal(judge(window({ cpuPercent: CPU_DEGRADED })).reason, "cpu");
  assert.equal(judge(window({ memRatio: MEM_DEGRADED })).reason, "memory");
});

test("a saturated WebKit renderer counts even when the multicore machine looks calm", () => {
  const verdict = judge(window({ rendererCpuPercent: RENDERER_CPU_DEGRADED }));
  assert.deepEqual(verdict, { level: "degraded", reason: "cpu" });
  const compositing = judge(window({
    rendererCpuPercent: RENDERER_CPU_DEGRADED,
    softwareCompositing: true,
  }));
  assert.deepEqual(compositing, { level: "degraded", reason: "compositing" });
});

test("native samples are optional", () => {
  const verdict = judge(window({ cpuPercent: null, appCpuPercent: null, memRatio: null }));
  assert.equal(verdict.level, "ok");
});

test("it takes a sustained run of bad windows to notify", () => {
  const verdict = { level: "degraded", reason: "cpu" };
  const short = run(initialGuardState(), verdict, ENTER_SAMPLES - 1, context());
  assert.equal(short.notify, null);
  const full = run(initialGuardState(), verdict, ENTER_SAMPLES, context());
  assert.equal(full.notify?.kind, "performance");
  assert.equal(full.notify?.action?.id, "hibernateIdleTerminals");
});

test("startup jank and background lag are both ignored", () => {
  const verdict = { level: "degraded", reason: "cpu" };
  assert.equal(run(initialGuardState(), verdict, ENTER_SAMPLES, context({ uptimeMs: 1_000 })).notify, null);
  assert.equal(run(initialGuardState(), verdict, ENTER_SAMPLES, context({ away: true })).notify, null);
});

test("background lag cannot pre-qualify a warning after focus returns", () => {
  const verdict = { level: "degraded", reason: "cpu" };
  const hidden = run(initialGuardState(), verdict, ENTER_SAMPLES + 3, context({ away: true }));
  assert.equal(hidden.state.badRun, 0);

  const firstVisible = nextGuardState(hidden.state, verdict, 20_000, context());
  assert.equal(firstVisible.notify, null);
  assert.equal(firstVisible.state.badRun, 1);

  const sustained = run(firstVisible.state, verdict, ENTER_SAMPLES - 1, context(), 21_000);
  assert.equal(sustained.notify?.kind, "performance");
});

test("one good window does not clear the state but a long run does", () => {
  const bad = run(initialGuardState(), { level: "degraded", reason: "cpu" }, ENTER_SAMPLES, context());
  const ok = { level: "ok", reason: "eventLoop" };
  assert.equal(run(bad.state, ok, 1, context()).state.level, "degraded");
  assert.equal(run(bad.state, ok, EXIT_SAMPLES, context()).state.level, "ok");
});

test("the same reason stays quiet for the cooldown", () => {
  const verdict = { level: "degraded", reason: "cpu" };
  const first = run(initialGuardState(), verdict, ENTER_SAMPLES, context());
  const again = run(first.state, verdict, ENTER_SAMPLES, context(), 10_000);
  assert.equal(again.notify, null);
  const later = nextGuardState(again.state, verdict, 10_000 + COOLDOWN_MS, context());
  assert.equal(later.notify?.kind, "performance");
});

test("a severe verdict may break the cooldown exactly once", () => {
  const first = run(initialGuardState(), { level: "degraded", reason: "cpu" }, ENTER_SAMPLES, context());
  const severe = { level: "severe", reason: "cpu" };
  const preempt = run(first.state, severe, ENTER_SAMPLES, context(), 10_000);
  assert.equal(preempt.notify?.kind, "performance");
  const second = run(preempt.state, severe, ENTER_SAMPLES, context(), 20_000);
  assert.equal(second.notify, null);
});

test("a session gets at most a handful of performance hints", () => {
  let state = initialGuardState();
  const reasons = ["cpu", "memory", "compositing", "eventLoop"];
  let fired = 0;
  reasons.forEach((reason, index) => {
    const result = run(state, { level: "degraded", reason }, ENTER_SAMPLES, context(), 1_000 + index * 100_000);
    state = result.state;
    if (result.notify) fired += 1;
  });
  assert.equal(fired, MAX_PER_SESSION);
});

test("Auto offers to stage GPU rendering without restarting live terminals", () => {
  const result = run(initialGuardState(), { level: "degraded", reason: "compositing" }, ENTER_SAMPLES, context());
  assert.equal(result.notify?.action?.id, "enableAcceleratedGraphics");
  assert.equal(result.notify?.action?.label, "Allow GPU next launch");
});

test("an explicit or environment-forced compatibility choice only opens settings", () => {
  const result = run(
    initialGuardState(),
    { level: "degraded", reason: "compositing" },
    ENTER_SAMPLES,
    context({ window: window({ autoGraphics: false }) }),
  );
  assert.equal(result.notify?.action?.id, "openGraphicsSettings");
});
