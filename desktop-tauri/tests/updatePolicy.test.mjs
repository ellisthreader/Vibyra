import assert from "node:assert/strict";
import test from "node:test";

import {
  advanceProgress,
  bannerCopy,
  formatBytes,
  navUpdateCopy,
  NO_PROGRESS,
} from "../src/lib/updatePolicy.ts";

const started = (contentLength) => ({ event: "Started", data: { contentLength } });
const chunk = (chunkLength) => ({ event: "Progress", data: { chunkLength } });
const finished = { event: "Finished" };

test("progress accumulates chunk sizes rather than reading them as totals", () => {
  // The plugin sends a chunk *size* per event, never a running total — the
  // difference between a working bar and one stuck near zero.
  let progress = advanceProgress(NO_PROGRESS, started(1000));
  assert.deepEqual(progress, { received: 0, total: 1000, percent: 0 });

  progress = advanceProgress(progress, chunk(250));
  assert.equal(progress.received, 250);
  assert.equal(progress.percent, 25);

  progress = advanceProgress(progress, chunk(250));
  assert.equal(progress.received, 500);
  assert.equal(progress.percent, 50);
});

test("a restarted download resets rather than doubling the byte count", () => {
  const first = advanceProgress(advanceProgress(NO_PROGRESS, started(100)), chunk(80));
  assert.equal(first.received, 80);

  const retried = advanceProgress(first, started(100));
  assert.deepEqual(retried, { received: 0, total: 100, percent: 0 });
});

test("progress never exceeds 100 percent even if the server undercounts", () => {
  let progress = advanceProgress(NO_PROGRESS, started(100));
  progress = advanceProgress(progress, chunk(500));
  assert.equal(progress.percent, 100);
  assert.equal(progress.received, 100);
});

test("a missing content length leaves percent at zero for an indeterminate bar", () => {
  let progress = advanceProgress(NO_PROGRESS, started(undefined));
  assert.equal(progress.total, 0);

  progress = advanceProgress(progress, chunk(4096));
  assert.equal(progress.received, 4096);
  assert.equal(progress.percent, 0, "no total means no honest percentage");

  assert.equal(advanceProgress(progress, finished).percent, 100);
});

test("banner copy names the version and matches the step the user is on", () => {
  const available = bannerCopy("available", "0.2.0", NO_PROGRESS, null);
  assert.match(available.title, /0\.2\.0/);
  assert.equal(available.action, "Update now");
  assert.equal(available.busy, false);

  const downloading = bannerCopy(
    "downloading",
    "0.2.0",
    { received: 50 * 1024 * 1024, total: 100 * 1024 * 1024, percent: 50 },
    null,
  );
  assert.equal(downloading.busy, true, "the button must not be re-clickable");
  assert.match(downloading.detail, /50%/);
  assert.match(downloading.detail, /50 MB of 100 MB/);

  const ready = bannerCopy("ready", "0.2.0", NO_PROGRESS, null);
  assert.equal(ready.action, "Restart now");
  assert.equal(ready.busy, false, "the restart must stay clickable");

  const installing = bannerCopy("installing", "0.2.0", NO_PROGRESS, null);
  assert.equal(installing.busy, true, "install must be single-flight");
  assert.match(installing.detail, /Saving every open terminal/);

  const restartFailed = bannerCopy("restartError", "0.2.0", NO_PROGRESS, "save failed");
  assert.equal(restartFailed.action, "Try restart again");
  assert.match(restartFailed.detail, /save failed/);

  const failed = bannerCopy("error", "0.2.0", NO_PROGRESS, "network unreachable");
  assert.equal(failed.action, "Try again");
  assert.match(failed.detail, /network unreachable/);
});

test("an unknown download size never renders a fake percentage", () => {
  const copy = bannerCopy("downloading", "0.2.0", { received: 900, total: 0, percent: 0 }, null);
  assert.doesNotMatch(copy.detail, /0%/);
  assert.match(copy.detail, /Downloading/);
});

test("the titlebar keeps every actionable update phase reachable", () => {
  assert.equal(navUpdateCopy("idle", "", NO_PROGRESS), null);
  assert.equal(navUpdateCopy("available", "0.2.0", NO_PROGRESS).label, "Update 0.2.0");

  const downloading = navUpdateCopy(
    "downloading",
    "0.2.0",
    { received: 25, total: 100, percent: 25 },
  );
  assert.equal(downloading.label, "Updating 25%");
  assert.equal(downloading.busy, true);

  assert.equal(navUpdateCopy("ready", "0.2.0", NO_PROGRESS).label, "Restart to update");
  assert.equal(navUpdateCopy("installing", "0.2.0", NO_PROGRESS).busy, true);
  assert.equal(navUpdateCopy("restartError", "0.2.0", NO_PROGRESS).label, "Retry restart");
  assert.equal(navUpdateCopy("error", "0.2.0", NO_PROGRESS).label, "Retry update");
});

test("byte formatting stays readable across the sizes a bundle actually hits", () => {
  assert.equal(formatBytes(0), "0 MB");
  assert.equal(formatBytes(1.5 * 1024 * 1024), "1.5 MB");
  assert.equal(formatBytes(157 * 1024 * 1024), "157 MB");
  assert.equal(formatBytes(2 * 1024 * 1024 * 1024), "2.0 GB");
});

test("release notes replace the generic prompt when they fit on one line", () => {
  const withNotes = bannerCopy("available", "0.2.0", NO_PROGRESS, null, "Faster terminals.");
  assert.equal(withNotes.detail, "Faster terminals.");

  // Multi-line notes are common in changelogs; only the first line can fit.
  const multiline = bannerCopy("available", "0.2.0", NO_PROGRESS, null, "Line one\nLine two");
  assert.equal(multiline.detail, "Line one");

  // Anything too long would overflow the card, so fall back.
  const long = bannerCopy("available", "0.2.0", NO_PROGRESS, null, "x".repeat(200));
  assert.match(long.detail, /takes about a minute/);

  const blank = bannerCopy("available", "0.2.0", NO_PROGRESS, null, "   ");
  assert.match(blank.detail, /takes about a minute/);
});
