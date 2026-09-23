import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  ACTIVITY_TICK_MS,
  ACTIVITY_TICK_MS_SLOW,
  activityTickMs,
  applyPerformanceMode,
  backgroundThrottleEnabled,
  DEFAULT_PERFORMANCE_MODE,
  leanChromeEnabled,
  normalizePerformanceMode,
  PERFORMANCE_MODES,
  perfWatchEnabled,
  startupPrefetchEnabled,
} from "../src/lib/performanceMode.ts";

const [FULL, BALANCED, BEST] = PERFORMANCE_MODES;

test("the levels are a ladder that only ever adds", () => {
  // Read down each column: once a saving switches on it never switches off
  // again. A level that took something back would make the Settings copy
  // ("everything Balanced does, plus...") a lie.
  assert.deepEqual(PERFORMANCE_MODES, [FULL, BALANCED, BEST]);
  assert.deepEqual(PERFORMANCE_MODES.map((m) => backgroundThrottleEnabled(m)), [false, true, true]);
  assert.deepEqual(PERFORMANCE_MODES.map((m) => startupPrefetchEnabled(m)), [true, false, false]);
  assert.deepEqual(PERFORMANCE_MODES.map((m) => leanChromeEnabled(m)), [false, false, true]);
  assert.deepEqual(PERFORMANCE_MODES.map((m) => perfWatchEnabled(m)), [true, true, false]);
});

test("Balanced changes nothing the user can see", () => {
  // The whole basis for making it the default. Only the two invisible savings
  // are on: the chrome is untouched and the activity dot keeps its exact rate.
  assert.equal(leanChromeEnabled(BALANCED), false);
  assert.equal(activityTickMs(BALANCED), ACTIVITY_TICK_MS);
  assert.equal(DEFAULT_PERFORMANCE_MODE, BALANCED);
});

test("the slower activity tick still resolves inside the working window", () => {
  assert.equal(activityTickMs(BEST), ACTIVITY_TICK_MS_SLOW);
  // activity.ts calls a pane idle 5s after its last output and promotes a
  // prompt to attention after 2.5s of quiet. A tick slower than either would
  // let a state be skipped between samples rather than merely reported late.
  assert.ok(ACTIVITY_TICK_MS_SLOW < 5_000);
  assert.ok(ACTIVITY_TICK_MS_SLOW > ACTIVITY_TICK_MS);
});

test("the perf watchdog survives Balanced and stops at Best performance", () => {
  // Its advice is how most people find this setting at all, so it has to
  // outlive the default. At the top the advice has already been taken.
  assert.equal(perfWatchEnabled(BALANCED), true);
  assert.equal(perfWatchEnabled(BEST), false);
});

test("an older settings.json resolves to a level rather than to nothing", () => {
  // The setting was a bool. `true` asked for every saving at once; `false` was
  // only ever the old default, so it lands on the new one — safe precisely
  // because Balanced changes nothing on screen. `performance.rs` agrees.
  assert.equal(normalizePerformanceMode(true), BEST);
  assert.equal(normalizePerformanceMode(false), BALANCED);
  for (const mode of PERFORMANCE_MODES) assert.equal(normalizePerformanceMode(mode), mode);
  for (const junk of [undefined, null, "", "turbo", 3, {}]) {
    assert.equal(normalizePerformanceMode(junk), DEFAULT_PERFORMANCE_MODE);
  }
});

test("each level publishes itself to the document element", () => {
  const root = { dataset: {} };
  globalThis.document = { documentElement: root };
  try {
    applyPerformanceMode(BEST);
    assert.equal(root.dataset.performance, BEST);
    applyPerformanceMode(BALANCED);
    assert.equal(root.dataset.performance, BALANCED);
    // Full carries no attribute at all, so the base sheets stand untouched.
    applyPerformanceMode(FULL);
    assert.equal("performance" in root.dataset, false);
  } finally {
    delete globalThis.document;
  }
});

/** `performanceMode.ts` with its comments removed. The comments discuss the
 * graphics axis at length on purpose; the code must never touch it. */
function policyCode() {
  return readFileSync(new URL("../src/lib/performanceMode.ts", import.meta.url), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");
}

test("the level policy cannot reach the graphics axis", () => {
  // Terminal panes once rendered black because WebGL loaded but never
  // composited, and the fix was to let Rust own that decision by itself. On
  // macOS the WebGL renderer is the *fast* path, so a future "saving" that
  // dropped it would cost performance and break panes at the same time.
  //
  // An import-free module cannot read the renderer policy, the settings store
  // or IPC, which is a stronger guarantee than asking reviewers to remember.
  const code = policyCode();
  assert.doesNotMatch(code, /\bimport\b/, "performanceMode.ts must stay import-free");
  for (const forbidden of ["rendererMode", "WebGL", "webgl", "ompositing", "canvas"]) {
    assert.ok(!code.includes(forbidden), `performanceMode.ts must not mention ${forbidden}`);
  }
});

test("the Performance settings row never offers the graphics choice", () => {
  // Two axes, two pages. Merging them is what the vault note forbids.
  const card = readFileSync(
    new URL("../src/components/settings/PerformanceCard.tsx", import.meta.url),
    "utf8",
  );
  assert.ok(!card.includes("rendererMode"), "graphics belongs to Settings > Advanced");
});
