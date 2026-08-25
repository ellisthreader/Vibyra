import assert from "node:assert/strict";
import test from "node:test";

import {
  ENTER_SAMPLES,
  EXIT_SAMPLES,
  COOLDOWN_MS,
  MAX_PER_SESSION,
  WARMUP_MS,
  initialGuardState,
  nextGuardState,
} from "../src/lib/perfGuard.ts";
import { perfWindow } from "./perfWindow.mjs";

function context(overrides = {}) {
  return { uptimeMs: WARMUP_MS + 1_000, away: false, window: perfWindow(), ...overrides };
}

/** Feeds the same verdict in `count` times, returning the last result. */
function run(state, verdict, count, ctx, startAt = 1_000) {
  let result = { state, notify: null };
  for (let index = 0; index < count; index += 1) {
    result = nextGuardState(result.state, verdict, startAt + index * 1_000, ctx);
  }
  return result;
}

test("it takes a sustained run of bad windows to notify", () => {
  const verdict = { level: "degraded", reason: "cpu" };
  const short = run(initialGuardState(), verdict, ENTER_SAMPLES - 1, context());
  assert.equal(short.notify, null);
  const full = run(initialGuardState(), verdict, ENTER_SAMPLES, context());
  assert.equal(full.notify?.category, "performance");
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
  assert.equal(sustained.notify?.category, "performance");
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
  assert.equal(later.notify?.category, "performance");
});

test("a severe verdict may break the cooldown exactly once", () => {
  const first = run(initialGuardState(), { level: "degraded", reason: "cpu" }, ENTER_SAMPLES, context());
  const severe = { level: "severe", reason: "cpu" };
  const preempt = run(first.state, severe, ENTER_SAMPLES, context(), 10_000);
  assert.equal(preempt.notify?.category, "performance");
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
    context({ window: perfWindow({ autoGraphics: false }) }),
  );
  assert.equal(result.notify?.action?.id, "openGraphicsSettings");
});

test("NVIDIA sessions are never offered GPU promotion", () => {
  // The pre-0.2.5 promotion offer is exactly how NVIDIA installs got stuck on
  // the slower one-draw-late path; a loaded NVIDIA machine gets the generic
  // hibernate remedy instead of graphics advice.
  const result = run(
    initialGuardState(),
    { level: "degraded", reason: "compositing" },
    ENTER_SAMPLES,
    context({ window: perfWindow({ softwareCompositing: true, nvidiaSession: true }) }),
  );
  assert.equal(result.notify?.action?.id, "hibernateIdleTerminals");
});

test("struggling on the GPU path on NVIDIA offers the way back to Automatic", () => {
  const stuck = perfWindow({
    nvidiaSession: true,
    acceleratedGraphics: true,
    autoGraphics: false,
  });
  const result = run(
    initialGuardState(),
    { level: "degraded", reason: "cpu" },
    ENTER_SAMPLES,
    context({ window: stuck }),
  );
  assert.equal(result.notify?.action?.id, "revertToAutoGraphics");

  // Without the forced mode there is nothing to revert; the generic remedy stands.
  const healthy = run(
    initialGuardState(),
    { level: "degraded", reason: "cpu" },
    ENTER_SAMPLES,
    context({ window: perfWindow({ nvidiaSession: true }) }),
  );
  assert.equal(healthy.notify?.action?.id, "hibernateIdleTerminals");
});
