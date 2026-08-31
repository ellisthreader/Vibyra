import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { bootView } from "../src/boot/bootState.ts";

test("every phase says something, so the window is never a blank rectangle", () => {
  const phases = ["starting", "checking", "downloading", "installing", "launching", "failed"];
  for (const phase of phases) {
    const view = bootView({ phase });
    assert.ok(view.status.length > 0, `${phase} rendered no status`);
  }
});

test("a download with no measured total sweeps rather than claiming progress", () => {
  // An unknown total drawn as a filling bar is a lie about how far along the
  // download is; the sweep says "working" without saying "nearly there".
  const view = bootView({ phase: "downloading", version: "0.2.9" });
  assert.equal(view.determinate, false);
  assert.equal(view.percent, 0);
  assert.match(view.status, /Downloading Vibyra 0\.2\.9/);
});

test("a measured download reports its percentage in the line and the rail", () => {
  const view = bootView({ phase: "downloading", version: "0.2.9", percent: 42 });
  assert.deepEqual(view, {
    status: "Downloading Vibyra 0.2.9 — 42%",
    determinate: true,
    percent: 42,
  });
});

test("zero percent is still a measurement, not a missing one", () => {
  // `percent: 0` is falsy, so a truthiness check here would silently demote a
  // download that has only just started back to the indeterminate sweep.
  const view = bootView({ phase: "downloading", version: "0.2.9", percent: 0 });
  assert.equal(view.determinate, true);
  assert.equal(view.percent, 0);
});

test("out-of-range and non-finite percentages are clamped, never rendered raw", () => {
  assert.equal(bootView({ phase: "downloading", percent: 150 }).percent, 100);
  assert.equal(bootView({ phase: "downloading", percent: -20 }).percent, 0);
  assert.equal(bootView({ phase: "downloading", percent: Number.NaN }).percent, 0);
  assert.equal(bootView({ phase: "downloading", percent: 41.6 }).percent, 42);
});

test("a missing version reads as a sentence rather than a gap", () => {
  assert.equal(bootView({ phase: "installing" }).status, "Installing the update…");
  assert.equal(bootView({ phase: "installing", version: "  " }).status, "Installing the update…");
});

test("phases outside a download never draw a measured rail", () => {
  for (const phase of ["starting", "checking", "installing", "launching", "failed"]) {
    const view = bootView({ phase, percent: 80 });
    assert.equal(view.determinate, false, `${phase} claimed a measurement`);
    assert.equal(view.percent, 0);
  }
});

test("the host emits only phase names this bundle can render", () => {
  // The two lists live in different languages and are joined by a string on
  // the wire; a phase added on one side and not the other would show up as a
  // frozen splash, which is exactly what nobody tests by hand.
  const boot = readFileSync(new URL("../src/boot/boot.ts", import.meta.url), "utf8");
  const known = new Set([...boot.matchAll(/^\s*"(\w+)",$/gm)].map((m) => m[1]));

  const rust = readFileSync(
    new URL("../src-tauri/src/boot_window.rs", import.meta.url),
    "utf8",
  );
  const emitted = [...rust.matchAll(/^pub const (?:\w+): &str = "(\w+)";$/gm)]
    .map((m) => m[1])
    .filter((name) => name !== "boot" && name !== "main");

  assert.ok(emitted.length > 0, "found no phase constants in boot_window.rs");
  for (const phase of emitted) {
    assert.ok(known.has(phase), `Rust emits "${phase}" but boot.ts ignores it`);
  }
});
