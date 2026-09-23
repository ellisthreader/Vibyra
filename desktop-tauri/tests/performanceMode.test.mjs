import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";

import {
  ACTIVITY_TICK_MS,
  ACTIVITY_TICK_MS_SLOW,
  DEFAULT_PERFORMANCE_MODE,
  PERFORMANCE_MODES,
  activityTickMs,
  applyPerformanceMode,
  backgroundThrottleEnabled,
  leanChromeEnabled,
  normalizePerformanceMode,
  perfWatchEnabled,
  startupPrefetchEnabled,
} from "../src/lib/performanceMode.ts";

test("three levels preserve the installed default and migrate the old switch", () => {
  assert.deepEqual(PERFORMANCE_MODES, ["full", "balanced", "best"]);
  assert.equal(DEFAULT_PERFORMANCE_MODE, "balanced");
  assert.equal(normalizePerformanceMode(false), "balanced");
  assert.equal(normalizePerformanceMode(true), "best");
  assert.equal(normalizePerformanceMode("full"), "full");
  assert.equal(normalizePerformanceMode("unknown"), "balanced");
});

test("balanced saves invisible work without altering chrome or visible activity", () => {
  assert.equal(startupPrefetchEnabled("full"), true);
  assert.equal(startupPrefetchEnabled("balanced"), false);
  assert.equal(backgroundThrottleEnabled("full"), false);
  assert.equal(backgroundThrottleEnabled("balanced"), true);
  assert.equal(perfWatchEnabled("balanced"), true);
  assert.equal(leanChromeEnabled("balanced"), false);
  assert.equal(activityTickMs("balanced"), ACTIVITY_TICK_MS);
});

test("best stops the watchdog and slows the ticker inside its working window", () => {
  assert.equal(perfWatchEnabled("best"), false);
  assert.equal(leanChromeEnabled("best"), true);
  assert.equal(activityTickMs("best"), ACTIVITY_TICK_MS_SLOW);
  assert.ok(ACTIVITY_TICK_MS_SLOW > ACTIVITY_TICK_MS);
  assert.ok(ACTIVITY_TICK_MS_SLOW < 5_000);
});

test("the level is published to the document and cleared for full", () => {
  const root = { dataset: {} };
  globalThis.document = { documentElement: root };
  try {
    applyPerformanceMode("balanced");
    assert.equal(root.dataset.performance, "balanced");
    applyPerformanceMode("best");
    assert.equal(root.dataset.performance, "best");
    applyPerformanceMode("full");
    assert.equal("performance" in root.dataset, false);
  } finally {
    delete globalThis.document;
  }
});

function authoredAnimations() {
  const dir = new URL("../src/styles/", import.meta.url);
  const found = new Map();
  for (const name of readdirSync(dir)) {
    if (!name.endsWith(".css") || name === "performance.css") continue;
    const css = readFileSync(new URL(name, dir), "utf8");
    for (const [, selector, declarations] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const animation = declarations.match(/(?:^|;)\s*animation\s*:\s*([^;!]+)/);
      if (!animation) continue;
      const key = selector.trim().split("\n").pop().trim();
      if (!found.has(key)) found.set(key, animation[1].trim());
    }
  }
  return found;
}

test("live-feedback animations retain the durations authored in their source sheets", () => {
  const css = readFileSync(new URL("../src/styles/performance.css", import.meta.url), "utf8");
  const authored = authoredAnimations();
  const exemptions = [...css.matchAll(/:root\[data-performance="best"\] ([^{]+)\{\s*animation:\s*([^;!]+)!important/g)];
  assert.ok(exemptions.length >= 8);
  for (const [, selector, shorthand] of exemptions) {
    const key = selector.trim();
    assert.ok(authored.has(key), `no source rule for ${key}`);
    assert.equal(shorthand.trim(), authored.get(key), `${key} drifted`);
  }
});

test("only best changes paint and renderer mode remains a separate setting", () => {
  const policy = readFileSync(new URL("../src/lib/performanceMode.ts", import.meta.url), "utf8");
  const css = readFileSync(new URL("../src/styles/performance.css", import.meta.url), "utf8");
  assert.match(css, /:root\[data-performance="best"\] \*/);
  assert.doesNotMatch(css, /data-performance="(?:full|balanced)"/);
  assert.match(css, /backdrop-filter: none !important/);
  assert.match(css, /animation-duration: 0\.01ms !important/);
  assert.doesNotMatch(policy.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\/\/.*$/gm, ""), /rendererMode/);
});
