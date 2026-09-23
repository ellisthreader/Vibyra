import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";

import { applyPerformanceMode, PERFORMANCE_MODES } from "../src/lib/performanceMode.ts";

const STYLES = new URL("../src/styles/", import.meta.url);
const PERFORMANCE_CSS = readFileSync(new URL("performance.css", STYLES), "utf8");

/** The attribute value the runtime actually publishes for the one level that
 * changes how the app looks. Read from the module rather than written down,
 * so a rename on either side fails here instead of silently switching the
 * paint half off with no type error to catch it. */
const LEAN = (() => {
  const root = { dataset: {} };
  globalThis.document = { documentElement: root };
  try {
    applyPerformanceMode(PERFORMANCE_MODES.at(-1));
    return root.dataset.performance;
  } finally {
    delete globalThis.document;
  }
})();

function styleSheets() {
  return readdirSync(STYLES)
    .filter((name) => name.endsWith(".css"))
    .map((name) => [name, readFileSync(new URL(name, STYLES), "utf8")]);
}

test("every stylesheet keys off the level the runtime publishes", () => {
  const seen = new Set();
  for (const [, css] of styleSheets()) {
    for (const [, level] of css.matchAll(/data-performance="([^"]*)"/g)) seen.add(level);
  }
  assert.ok(seen.size > 0, "no sheet reacts to the performance level at all");
  assert.deepEqual([...seen], [LEAN]);
});

test("Balanced never changes how anything looks", () => {
  // The promise the default rests on, and the reason it was safe to move every
  // existing Mac onto it. Styling `balanced` anywhere would break that
  // silently, because nothing else would fail.
  for (const [name, css] of styleSheets()) {
    assert.ok(
      !css.includes('data-performance="balanced"'),
      `${name} styles the Balanced level, which must stay invisible`,
    );
  }
});

/** The first `animation:` shorthand per selector across src/styles. First, not
 * last: several sheets override themselves inside a `prefers-reduced-motion`
 * block, and it is the base rule these exemptions restate. */
function authoredAnimations() {
  const found = new Map();
  for (const [name, css] of styleSheets()) {
    if (name === "performance.css") continue;
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
  const authored = authoredAnimations();
  const exemptions = [
    ...PERFORMANCE_CSS.matchAll(
      new RegExp(`:root\\[data-performance="${LEAN}"\\] ([^{]+)\\{\\s*animation:\\s*([^;!]+)!important`, "g"),
    ),
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
  const names = new Set();
  for (const [name, css] of styleSheets()) {
    if (name === "performance.css") continue;
    for (const [, animation] of css.matchAll(/animation:\s*([\w-]+)[^;]*\binfinite\b/g)) {
      names.add(animation);
    }
  }
  return names;
}

test("every looping animation is classified as feedback or decoration", () => {
  // The completeness half of the exemption list. Add a new spinner and this
  // fails until someone decides whether the top level may stop it — which
  // beats shipping a frozen one nobody noticed.
  const STOPPED_ON_PURPOSE = new Set([
    // Opacity-only emphasis on the activity dots; the colour and halo carry
    // the state on their own, and the loop ends at full opacity.
    "pulse-ring",
    // Settings keeps its explicit busy/saving text when the decorative dot rests.
    "status-pulse",
    // The listening ripple is decoration on top of a glow that already scales
    // with the microphone through a transition, so a still circle is still
    // visibly listening.
    "orb-ripple",
  ]);
  const kept = new Set(
    [...PERFORMANCE_CSS.matchAll(/animation:\s*([\w-]+)[^;]*!important/g)].map(([, name]) => name),
  );
  for (const animation of infiniteAnimations()) {
    assert.ok(
      kept.has(animation) || STOPPED_ON_PURPOSE.has(animation),
      `${animation} loops forever but the top level neither keeps nor knowingly stops it`,
    );
  }
});

test("the top level still strips motion, blur and nothing structural", () => {
  assert.match(PERFORMANCE_CSS, new RegExp(`:root\\[data-performance="${LEAN}"\\] \\*,`));
  assert.match(PERFORMANCE_CSS, /backdrop-filter: none !important;/);
  assert.match(PERFORMANCE_CSS, /animation-duration: 0\.01ms !important;/);
  // Compositing hints belong to the graphics axis, which this mode may not
  // touch at any level. See `Tauri Terminal Performance Overhaul` in the vault.
  for (const forbidden of ["will-change", "backface-visibility", "translateZ"]) {
    assert.ok(!PERFORMANCE_CSS.includes(forbidden), `performance.css must not set ${forbidden}`);
  }
});
