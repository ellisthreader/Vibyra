import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { CHANGELOG, entryFor, formatDate, shouldOpen } from "../src/lib/changelog.ts";
import { enqueue } from "../src/state/notificationQueue.ts";
import { updateNotice, updateReadyNotice } from "../src/lib/updateNotices.ts";
import { VIEWBOX, problemsWith } from "../scripts/new-release-art.mjs";

const source = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

test("the updater announces without stacking a second card", () => {
  // The bug: banner plus an "available" toast plus a "ready" toast, all three
  // sticky, all three in the same corner.
  const empty = { history: [], visible: [] };
  const available = enqueue(empty, updateNotice("0.7.6", "notes"), 1, 0);
  assert.equal(available.visible.length, 0, "no toast competes with the banner");
  assert.equal(available.history.length, 1, "the bell still records it");

  const ready = enqueue(available, updateReadyNotice("0.7.6"), 2, 60_000);
  assert.equal(ready.visible.length, 0);
  assert.equal(ready.history.length, 2, "both notices remain readable in the bell");
});

test("a notice without the flag still toasts", () => {
  const result = enqueue({ history: [], visible: [] }, {
    category: "system",
    severity: "info",
    title: "Something happened",
  }, 1, 0);
  assert.equal(result.visible.length, 1);
});

test("update notices stay sticky and OS-eligible", () => {
  for (const notice of [updateNotice("0.7.6"), updateReadyNotice("0.7.6")]) {
    assert.equal(notice.timeoutMs, 0, "never auto-dismisses");
    assert.notEqual(notice.osEligible, false, "still reaches Notification Centre");
    assert.equal(notice.severity, "success", "info is refused escalation");
  }
});

test("what's new opens only on a real upgrade", () => {
  assert.equal(shouldOpen("0.7.6", "0.7.5"), true);
  assert.equal(shouldOpen("0.7.6", "0.7.6"), false, "same build, already read");
  assert.equal(shouldOpen("0.7.6", null), false, "a first install has no news");
  assert.equal(shouldOpen("0.7.6", ""), false);
  assert.equal(shouldOpen("9.9.9", "0.7.5"), false, "no entry written, nothing to show");
});

test("the shipped version has an entry to show", () => {
  const { version } = JSON.parse(source("../src-tauri/tauri.conf.json"));
  assert.ok(entryFor(version), `changelog is missing an entry for ${version}`);
  assert.equal(CHANGELOG[0].version, version, "newest entry is this build");
});

test("the shipped version has its own hero art", () => {
  // Every release gets art generated for it. Reusing the previous release's
  // image is the failure this catches: the path is version-stamped, so a
  // forgotten regeneration shows up as a missing file rather than as a stale
  // picture nobody notices.
  const { version } = JSON.parse(source("../src-tauri/tauri.conf.json"));
  const entry = entryFor(version);
  assert.equal(
    entry.image,
    `/releases/${version}.svg`,
    `run: npm run release:art -- --subject "…"`,
  );
  const svg = source(`../public${entry.image}`);
  assert.deepEqual(problemsWith(svg), [], "the art fails its own checks");
});

test("art checks reject what a thumbnail would not show", () => {
  const ok = `<svg viewBox="${VIEWBOX}"><rect width="740" height="232"/></svg>`;
  assert.deepEqual(problemsWith(ok), []);
  assert.ok(problemsWith(ok.replace(VIEWBOX, "0 0 100 100")).length > 0, "wrong viewBox");
  assert.ok(problemsWith(ok.replace("<rect", "<text>hi</text><rect")).length > 0, "text");
  assert.ok(
    problemsWith(ok.replace("<rect", '<image href="https://x/y.png"/><rect')).length > 0,
    "remote reference",
  );
});

test("every entry is complete", () => {
  for (const entry of CHANGELOG) {
    assert.match(entry.version, /^\d+\.\d+\.\d+$/);
    assert.match(entry.date, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(entry.sections.length > 0, `${entry.version} has nothing written up`);
    for (const section of entry.sections) {
      assert.ok(section.heading.trim(), "a section needs a heading");
      assert.ok(section.body.trim().length > 20, "a section needs real prose");
    }
  }
});

test("the dateline is a long date, not an ISO string", () => {
  assert.match(formatDate("2026-09-21"), /2026/);
  assert.doesNotMatch(formatDate("2026-09-21"), /^2026-09-21$/);
  assert.equal(formatDate("nonsense"), "nonsense", "an unparseable date is passed through");
});

test("the window is a reading surface with one way out", () => {
  const view = source("../src/components/layout/WhatsNew.tsx");
  assert.match(view, /role="dialog"/);
  assert.match(view, /aria-modal="true"/);
  assert.match(view, /useModalFocus/, "Escape closes it like every other modal");
  assert.match(view, /aria-label="Close what's new"/);
});

test("the seen version is recorded even when nothing is shown", () => {
  // Otherwise a build with no written entry re-arms the check every launch.
  const store = source("../src/state/whatsNewStore.ts");
  // The implementation, not the interface declaration of the same name.
  const arrived = store.slice(store.lastIndexOf("arrived:"), store.lastIndexOf("open:"));
  assert.ok(
    arrived.indexOf("write(version)") < arrived.indexOf("shouldOpen"),
    "the version is written before the decision to open",
  );
});
