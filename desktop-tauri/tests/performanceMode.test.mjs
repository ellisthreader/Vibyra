import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";

import {
  ACTIVITY_TICK_MS,
  ACTIVITY_TICK_MS_FAST,
  activityTickMs,
  applyPerformanceMode,
  backgroundThrottleEnabled,
  perfWatchEnabled,
  startupPrefetchEnabled,
} from "../src/lib/performanceMode.ts";

test("performance mode stops the perf watchdog", () => {
  // The watch costs a 1Hz timer plus a native process sample; its only output
  // is advice to do what this mode already did.
  assert.equal(perfWatchEnabled(false), true);
  assert.equal(perfWatchEnabled(true), false);
});

test("performance mode skips the startup prefetch", () => {
  assert.equal(startupPrefetchEnabled(false), true);
  assert.equal(startupPrefetchEnabled(true), false);
});

test("the slower activity tick still resolves inside the working window", () => {
  assert.equal(activityTickMs(false), ACTIVITY_TICK_MS);
  assert.equal(activityTickMs(true), ACTIVITY_TICK_MS_FAST);
  // activity.ts calls a pane idle 5s after its last output and promotes a
  // prompt to attention after 2.5s of quiet. A tick slower than either would
  // let a state be skipped between samples rather than merely reported late.
  assert.ok(ACTIVITY_TICK_MS_FAST < 5_000);
  assert.ok(ACTIVITY_TICK_MS_FAST > ACTIVITY_TICK_MS);
});

test("output only slows off screen once the mode is on", () => {
  // Off, an unwatched window still flushes every 16ms. On, it drops to Rust's
  // hidden cadence — the same path non-active projects already take.
  assert.equal(backgroundThrottleEnabled(false), false);
  assert.equal(backgroundThrottleEnabled(true), true);
});

test("the mode is published to the document element and cleared again", () => {
  const root = { dataset: {} };
  globalThis.document = { documentElement: root };
  try {
    applyPerformanceMode(true);
    assert.equal(root.dataset.performance, "on");
    applyPerformanceMode(false);
    assert.equal("performance" in root.dataset, false);
  } finally {
    delete globalThis.document;
  }
});

/** The first `animation:` shorthand per selector across src/styles. First, not
 * last: several sheets override themselves inside a `prefers-reduced-motion`
 * block, and it is the base rule these exemptions restate. */
function authoredAnimations() {
  const dir = new URL("../src/styles/", import.meta.url);
  const found = new Map();
  for (const name of readdirSync(dir)) {
    if (!name.endsWith(".css") || name === "performance.css") continue;
    const css = readFileSync(new URL(name, dir), "utf8");
    for (const [, selector, shorthand] of css.matchAll(
      /([^{}]+)\{[^{}]*?\n\s*animation:\s*([^;!]+)/g,
    )) {
      const key = selector.trim().split("\n").pop().trim();
      if (!found.has(key)) found.set(key, shorthand.trim());
    }
  }
  return found;
}

test("exempted spinners keep the exact animation their source sheet declares", () => {
  // performance.css restates these because `revert` would drop to the
  // user-agent value (0s). Restating means they can drift; this is the guard.
  // A frozen spinner reads as "hung", and a stopped update sweep sits parked
  // off the end of its own track.
  const css = readFileSync(new URL("../src/styles/performance.css", import.meta.url), "utf8");
  const authored = authoredAnimations();
  const exemptions = [
    ...css.matchAll(/:root\[data-performance="on"\] ([^{]+)\{\s*animation:\s*([^;!]+)!important/g),
  ];
  assert.ok(exemptions.length >= 8, "expected the live-feedback exemption block");
  for (const [, selector, shorthand] of exemptions) {
    const key = selector.trim();
    assert.ok(authored.has(key), `no source rule found for ${key}`);
    assert.equal(shorthand.trim(), authored.get(key), `${key} drifted from its source sheet`);
  }
});

/** Animations declared `infinite` anywhere in src/styles, by name. */
function infiniteAnimations() {
  const dir = new URL("../src/styles/", import.meta.url);
  const names = new Set();
  for (const name of readdirSync(dir)) {
    if (!name.endsWith(".css") || name === "performance.css") continue;
    const css = readFileSync(new URL(name, dir), "utf8");
    for (const [, animation] of css.matchAll(/animation:\s*([\w-]+)[^;]*\binfinite\b/g)) {
      names.add(animation);
    }
  }
  return names;
}

test("every looping animation is classified as feedback or decoration", () => {
  // The completeness half of the exemption list. Add a new spinner and this
  // fails until someone decides whether Performance mode may stop it — which
  // beats shipping a frozen one nobody noticed.
  const STOPPED_ON_PURPOSE = new Set([
    // Opacity-only emphasis on the activity dots; the colour and halo carry
    // the state on their own, and the loop ends at full opacity.
    "pulse-ring",
  ]);
  const css = readFileSync(new URL("../src/styles/performance.css", import.meta.url), "utf8");
  const kept = new Set(
    [...css.matchAll(/animation:\s*([\w-]+)[^;]*!important/g)].map(([, name]) => name),
  );
  for (const animation of infiniteAnimations()) {
    assert.ok(
      kept.has(animation) || STOPPED_ON_PURPOSE.has(animation),
      `${animation} loops forever but Performance mode neither keeps nor knowingly stops it`,
    );
  }
});

test("the stylesheet targets the attribute the runtime actually sets", () => {
  // The mode is wired through a data attribute, so a rename on either side
  // would silently leave the paint half switched off with no type error.
  const css = readFileSync(new URL("../src/styles/performance.css", import.meta.url), "utf8");
  assert.match(css, /:root\[data-performance="on"\] \*,/);
  assert.match(css, /backdrop-filter: none !important;/);
  assert.match(css, /animation-duration: 0\.01ms !important;/);
});
